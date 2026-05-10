#!/usr/bin/env python3
"""
report.py: Build period reports from the JSON DB.

Reads transactions, statements, anomalies, subscriptions, categories from db/.
Writes a structured JSON report to db/reports/<YYYY-MM>.json and a Markdown
rendering to db/reports/<YYYY-MM>.md.

Usage:
  python3 scripts/report.py                  # generate for every month with data
  python3 scripts/report.py 2026-04          # generate for a specific month
  python3 scripts/report.py 2026-03 2026-04  # generate for multiple months

Schema: see skill/features/reporting.md.
"""

from __future__ import annotations

import os
import sys
import json
import datetime
from pathlib import Path
from collections import defaultdict

import yaml


REPORT_VERSION = 1


def load_config() -> dict:
    config_path = os.environ.get("FINANCE_CONFIG")
    if not config_path:
        ptr = Path.home() / ".config/finance/data_root"
        if ptr.exists():
            data_root = Path(ptr.read_text().strip())
            config_path = data_root / "config.yaml"
        else:
            config_path = Path.home() / "claude-configs/finance-data/config.yaml"
    config_path = Path(config_path)
    if not config_path.exists():
        sys.exit(f"config.yaml not found at {config_path}. Run scripts/init.sh first.")
    return yaml.safe_load(config_path.read_text())


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text())


def save_json_atomic(path: Path, data) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    os.replace(tmp, path)


def build_report(period: str, db_path: Path) -> dict:
    txns = load_json(db_path / "transactions.json", [])
    statements = load_json(db_path / "statements.json", [])
    anomalies = load_json(db_path / "anomalies.json", [])
    subscriptions = load_json(db_path / "subscriptions.json", [])
    categories = load_json(db_path / "categories.json", [])

    cats_by_id = {c["id"]: c for c in categories}

    # Period filter
    period_txns = [t for t in txns if t["date_posted"].startswith(period)]
    if not period_txns:
        return {"empty": True, "period": period}

    start = min(t["date_posted"] for t in period_txns)
    end = max(t["date_posted"] for t in period_txns)

    accounts_included = sorted({t["account_id"] for t in period_txns})

    # Treat transfers as neither income nor spend
    def _is_transfer(t):
        return t["type"] == "transfer" or t.get("category") in ("cc_payment", "account_transfer")

    income_total = sum(t["amount"] for t in period_txns if t["amount"] > 0 and not _is_transfer(t))
    spend_total = sum(t["amount"] for t in period_txns if t["amount"] < 0 and not _is_transfer(t))
    net_cashflow = income_total + spend_total

    # Savings rate is only meaningful when actual income (paycheck-scale) is loaded.
    # Skip it when only refunds/credits are present, which yields nonsense ratios.
    SAVINGS_RATE_MIN_INCOME = 500.0
    savings_rate = (net_cashflow / income_total) if income_total >= SAVINGS_RATE_MIN_INCOME else None

    # Spend by category (only outflows)
    cat_buckets: dict[str, dict] = defaultdict(lambda: {"amount": 0.0, "txn_count": 0})
    for t in period_txns:
        if t["amount"] < 0 and not _is_transfer(t):
            cid = t.get("category") or "uncategorized"
            cat_buckets[cid]["amount"] += t["amount"]
            cat_buckets[cid]["txn_count"] += 1
    total_spend_abs = abs(spend_total) if spend_total else 1
    spend_by_category = []
    for cid, bucket in cat_buckets.items():
        spend_by_category.append({
            "category_id": cid,
            "name": cats_by_id.get(cid, {}).get("name", cid),
            "amount": round(bucket["amount"], 2),
            "txn_count": bucket["txn_count"],
            "pct_of_total": round(abs(bucket["amount"]) / total_spend_abs, 4),
        })
    spend_by_category.sort(key=lambda x: x["amount"])  # most negative first

    # Top merchants
    merch_buckets: dict[str, dict] = defaultdict(lambda: {"amount": 0.0, "txn_count": 0, "category": None})
    for t in period_txns:
        if _is_transfer(t):
            continue
        m = t.get("merchant_canonical") or t["description_normalized"][:40]
        merch_buckets[m]["amount"] += t["amount"]
        merch_buckets[m]["txn_count"] += 1
        merch_buckets[m]["category"] = t.get("category")
    top_amount = sorted(
        [{"merchant": k, **v, "amount": round(v["amount"], 2)} for k, v in merch_buckets.items()],
        key=lambda x: x["amount"],
    )[:10]
    top_freq = sorted(
        [{"merchant": k, **v, "amount": round(v["amount"], 2)} for k, v in merch_buckets.items()],
        key=lambda x: -x["txn_count"],
    )[:10]

    # Subscriptions snapshot
    active_subs = [s for s in subscriptions if s.get("status") == "active"]
    cancellation_candidates = [s for s in active_subs if s.get("suggestion_tags")]
    monthly_cost_total = round(sum(s.get("monthly_cost", 0.0) for s in active_subs), 2)
    annual_cost_total = round(sum(s.get("annual_cost", 0.0) for s in active_subs), 2)

    # Single-charge subscription candidates (not yet confirmed; surface for visibility)
    pending_sub_candidates = []
    for t in period_txns:
        if t.get("subscription_candidate") and not t.get("subscription_id"):
            pending_sub_candidates.append({
                "txn_id": t["id"],
                "merchant": t.get("merchant_canonical"),
                "amount": t["amount"],
                "date": t["date_posted"],
                "note": "Single charge in this period; needs 2+ to confirm cadence.",
            })

    # Anomalies in this period (overlay current merchant from txn for display freshness)
    txn_by_id = {t["id"]: t for t in period_txns}
    period_anomalies = []
    for a in anomalies:
        if a["txn_id"] not in txn_by_id:
            continue
        t = txn_by_id[a["txn_id"]]
        period_anomalies.append({**a, "merchant": t.get("merchant_canonical") or a.get("merchant")})

    # Categories added this period
    cats_this_period = [
        {
            "category_id": c["id"],
            "name": c["name"],
            "parent": c.get("parent"),
            "created_by": c.get("created_by"),
            "example_merchants": c.get("example_merchants", []),
        }
        for c in categories
        if c.get("created_at", "").startswith(period) and c.get("created_by") in ("ai", "user")
    ]

    # Credit utilization (per credit card statement that closed in this period)
    credit = []
    for s in statements:
        if not s.get("credit_card"):
            continue
        if not s["period_end"].startswith(period):
            continue
        cc = s["credit_card"]
        utilization = None
        ending = s.get("ending_balance")
        if cc.get("credit_limit") and ending is not None:
            current_balance = (cc["credit_limit"] or 0) - (cc.get("available_credit") or 0)
            utilization = round(current_balance / cc["credit_limit"], 4)
        credit.append({
            "account_id": s["account_id"],
            "credit_limit": cc.get("credit_limit"),
            "current_balance": round(ending, 2) if ending is not None else None,
            "available_credit": cc.get("available_credit"),
            "utilization": utilization,
            "payment_due_date": cc.get("payment_due_date"),
            "min_payment_due": cc.get("min_payment_due"),
            "statement_close_date": s["period_end"],
            "rewards_balance": cc.get("rewards_balance"),
            "rewards_earned_this_period": cc.get("rewards_earned"),
        })

    # Data quality
    uncategorized = sum(1 for t in period_txns if not t.get("category"))
    data_quality = {
        "uncategorized_count": uncategorized,
        "missing_statements": [],     # populated if we detect a gap (multi-month coverage)
        "balance_mismatches": [],     # populated when reconciliation fails
    }

    # Narrative
    narrative_parts = []
    if total_spend_abs:
        narrative_parts.append(f"Spent ${total_spend_abs:,.2f} across {len([t for t in period_txns if t['amount'] < 0 and not _is_transfer(t)])} transactions.")
    if income_total:
        narrative_parts.append(f"Inflows totaled ${income_total:,.2f}.")
    if spend_by_category:
        top_cat = spend_by_category[0]
        narrative_parts.append(f"Largest category: {top_cat['name']} at ${abs(top_cat['amount']):,.2f}.")
    if cancellation_candidates:
        narrative_parts.append(f"{len(cancellation_candidates)} subscription cancellation candidate(s) flagged.")
    if period_anomalies:
        narrative_parts.append(f"{len(period_anomalies)} anomaly event(s) for review.")
    if cats_this_period:
        narrative_parts.append(f"Added {len(cats_this_period)} new categor{'y' if len(cats_this_period)==1 else 'ies'} this period.")
    narrative = " ".join(narrative_parts)

    return {
        "version": REPORT_VERSION,
        "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
        "period": {"start": start, "end": end, "month": period},
        "accounts_included": accounts_included,
        "summary": {
            "total_income": round(income_total, 2),
            "total_spend": round(spend_total, 2),
            "net_cashflow": round(net_cashflow, 2),
            "savings_rate": round(savings_rate, 4) if savings_rate is not None else None,
            "txn_count": len(period_txns),
            "vs_prior_period": None,
        },
        "spend_by_category": spend_by_category,
        "top_merchants_by_amount": top_amount,
        "top_merchants_by_frequency": top_freq,
        "subscriptions": {
            "active_count": len(active_subs),
            "monthly_cost_total": monthly_cost_total,
            "annual_cost_total": annual_cost_total,
            "cancellation_candidates": [
                {
                    "subscription_id": s["id"],
                    "merchant": s.get("merchant_canonical"),
                    "monthly_cost": s.get("monthly_cost"),
                    "annual_cost": s.get("annual_cost"),
                    "tags": s.get("suggestion_tags", []),
                    "reason": s.get("suggestion_reason"),
                }
                for s in cancellation_candidates
            ],
            "pending_candidates": pending_sub_candidates,
        },
        "anomalies": [
            {
                "id": a["id"],
                "txn_id": a["txn_id"],
                "flag": a["flag"],
                "amount": a["amount"],
                "merchant": a.get("merchant"),
                "reason": a.get("reason"),
                "confidence": a.get("confidence"),
            }
            for a in period_anomalies
        ],
        "categories_added_this_period": cats_this_period,
        "credit": credit,
        "data_quality": data_quality,
        "narrative": narrative,
    }


def render_markdown(report: dict) -> str:
    if report.get("empty"):
        return f"# {report['period']}\n\nNo transactions for this period.\n"

    p = report["period"]
    s = report["summary"]
    lines: list[str] = []
    lines.append(f"# Finance Report: {p['month']}")
    lines.append("")
    lines.append(f"_Period: {p['start']} to {p['end']} | Generated {report['generated_at']}_")
    lines.append("")
    lines.append(f"**{report['narrative']}**")
    lines.append("")

    lines.append("## Summary")
    lines.append("")
    lines.append("| Metric | Value |")
    lines.append("|---|---:|")
    lines.append(f"| Income | ${s['total_income']:,.2f} |")
    lines.append(f"| Spend  | ${s['total_spend']:,.2f} |")
    lines.append(f"| Net cashflow | ${s['net_cashflow']:,.2f} |")
    if s["savings_rate"] is not None:
        lines.append(f"| Savings rate | {s['savings_rate']*100:.1f}% |")
    lines.append(f"| Transactions | {s['txn_count']} |")
    lines.append("")

    lines.append("## Spend by Category")
    lines.append("")
    lines.append("| Category | Amount | Txns | % of spend |")
    lines.append("|---|---:|---:|---:|")
    for c in report["spend_by_category"]:
        lines.append(f"| {c['name']} | ${c['amount']:,.2f} | {c['txn_count']} | {c['pct_of_total']*100:.1f}% |")
    lines.append("")

    lines.append("## Top Merchants (by amount)")
    lines.append("")
    lines.append("| Merchant | Amount | Txns | Category |")
    lines.append("|---|---:|---:|---|")
    for m in report["top_merchants_by_amount"][:10]:
        lines.append(f"| {m['merchant']} | ${m['amount']:,.2f} | {m['txn_count']} | {m.get('category') or ''} |")
    lines.append("")

    lines.append("## Top Merchants (by frequency)")
    lines.append("")
    lines.append("| Merchant | Txns | Amount | Category |")
    lines.append("|---|---:|---:|---|")
    for m in report["top_merchants_by_frequency"][:10]:
        lines.append(f"| {m['merchant']} | {m['txn_count']} | ${m['amount']:,.2f} | {m.get('category') or ''} |")
    lines.append("")

    subs = report["subscriptions"]
    lines.append("## Subscriptions")
    lines.append("")
    lines.append(f"- Active subscriptions: **{subs['active_count']}**")
    lines.append(f"- Total monthly cost: **${subs['monthly_cost_total']:,.2f}**")
    lines.append(f"- Total annual cost: **${subs['annual_cost_total']:,.2f}**")
    lines.append("")
    if subs["cancellation_candidates"]:
        lines.append("### Cancellation candidates")
        lines.append("")
        for c in subs["cancellation_candidates"]:
            tags = ", ".join(c["tags"])
            lines.append(f"- **{c['merchant']}** (${c['monthly_cost']:.2f}/mo, ${c['annual_cost']:.2f}/yr) [{tags}]")
            if c.get("reason"):
                lines.append(f"  - {c['reason']}")
        lines.append("")
    if subs.get("pending_candidates"):
        lines.append("### Pending subscription candidates (single charge)")
        lines.append("")
        for c in subs["pending_candidates"]:
            lines.append(f"- {c['merchant']} ${abs(c['amount']):.2f} on {c['date']}: {c['note']}")
        lines.append("")

    if report["anomalies"]:
        lines.append("## Anomalies")
        lines.append("")
        for a in report["anomalies"]:
            lines.append(f"- **{a['flag']}** | {a['merchant']} | ${a['amount']:,.2f} | conf {a['confidence']:.2f}")
            if a.get("reason"):
                lines.append(f"  - {a['reason']}")
        lines.append("")

    if report["categories_added_this_period"]:
        lines.append("## Categories added this period")
        lines.append("")
        for c in report["categories_added_this_period"]:
            ex = ", ".join(c.get("example_merchants", []))
            lines.append(f"- **{c['name']}** (id={c['category_id']}, parent={c.get('parent')}) — examples: {ex}")
        lines.append("")

    if report["credit"]:
        lines.append("## Credit")
        lines.append("")
        for c in report["credit"]:
            util = f"{c['utilization']*100:.1f}%" if c.get("utilization") is not None else "n/a"
            limit_str = f"${c['credit_limit']:,.2f}" if c.get("credit_limit") else "n/a"
            balance_str = f"${c['current_balance']:,.2f}" if c.get("current_balance") is not None else "n/a"
            lines.append(f"- **{c['account_id']}**: balance {balance_str} / limit {limit_str} (utilization {util})")
            bits = []
            if c.get("min_payment_due") is not None and c.get("payment_due_date"):
                bits.append(f"due ${c['min_payment_due']:.2f} on {c['payment_due_date']}")
            if c.get("rewards_balance"):
                rewards = f"rewards balance {c['rewards_balance']:,}"
                if c.get("rewards_earned_this_period"):
                    rewards += f" (+{c['rewards_earned_this_period']:,} this period)"
                bits.append(rewards)
            if bits:
                lines.append(f"  - {', '.join(bits)}")
        lines.append("")

    dq = report["data_quality"]
    lines.append("## Data quality")
    lines.append("")
    lines.append(f"- Uncategorized: {dq['uncategorized_count']}")
    if dq["missing_statements"]:
        lines.append(f"- Missing statements: {dq['missing_statements']}")
    if dq["balance_mismatches"]:
        lines.append(f"- Balance mismatches: {dq['balance_mismatches']}")
    lines.append("")
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    cfg = load_config()
    db_path = Path(cfg["db_path"])
    reports_dir = db_path / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)

    if len(argv) > 1:
        periods = argv[1:]
    else:
        # Auto-detect every month with at least one transaction
        txns = load_json(db_path / "transactions.json", [])
        periods = sorted({t["date_posted"][:7] for t in txns})

    if not periods:
        print("No transactions in DB. Nothing to report.")
        return 0

    for period in periods:
        report = build_report(period, db_path)
        if report.get("empty"):
            print(f"  {period}: no transactions")
            continue
        json_path = reports_dir / f"{period}.json"
        md_path = reports_dir / f"{period}.md"
        save_json_atomic(json_path, report)
        md_path.write_text(render_markdown(report))
        print(f"  {period}: wrote {json_path.name} and {md_path.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
