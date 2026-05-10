"""
MyfAInance backend.

Reads the JSON DB and serves a small REST API. Static frontend mounted at /.
Read-only by default with two light writes (mute anomaly, mark reviewed).

Run from web/backend/:
  .venv/bin/uvicorn main:app --reload --port 8000
"""

import os
import json
import re
import datetime
from datetime import date as _date
from pathlib import Path
from typing import Optional

import yaml
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel


# ---------- config + paths ----------

def _load_config() -> dict:
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
        raise RuntimeError(f"config.yaml not found at {config_path}. Run scripts/init.sh first.")
    return yaml.safe_load(config_path.read_text())


CFG = _load_config()
DB = Path(CFG["db_path"])
PERSONAL = Path(CFG["personal_path"])
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


# ---------- helpers ----------

def _read_json(name: str, default):
    p = DB / name
    if not p.exists():
        return default
    return json.loads(p.read_text())


def _write_json_atomic(name: str, data) -> None:
    p = DB / name
    tmp = p.with_suffix(p.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    os.replace(tmp, p)


def _read_yaml(path: Path) -> dict:
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text()) or {}


# ---------- app ----------

app = FastAPI(title="MyfAInance", version="0.1.0")

# Allow Vite dev server to call us during dev.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/state")
def get_state():
    txns = _read_json("transactions.json", [])
    stmts = _read_json("statements.json", [])
    cats = _read_json("categories.json", [])
    subs = _read_json("subscriptions.json", [])
    anoms = _read_json("anomalies.json", [])
    mers = _read_json("merchants.json", [])

    periods = sorted({t["date_posted"][:7] for t in txns}, reverse=True)

    accounts = _read_yaml(PERSONAL / "accounts.yaml").get("accounts", [])

    return {
        "counts": {
            "statements": len(stmts),
            "transactions": len(txns),
            "categories": len(cats),
            "subscriptions": len(subs),
            "anomalies": len(anoms),
            "merchants": len(mers),
        },
        "periods": periods,
        "accounts": accounts,
        "latest_period": periods[0] if periods else None,
    }


@app.get("/api/reports")
def list_reports():
    reports_dir = DB / "reports"
    if not reports_dir.exists():
        return []
    out = []
    for f in sorted(reports_dir.glob("*.json"), reverse=True):
        try:
            data = json.loads(f.read_text())
            out.append({
                "period": data["period"]["month"],
                "summary": data["summary"],
                "narrative": data.get("narrative"),
            })
        except Exception:
            continue
    return out


@app.get("/api/reports/{period}")
def get_report(period: str):
    """Return the report for `period` (YYYY-MM). Falls back to building
    one in-process from db/transactions.json when no precomputed file
    exists, and to a zero-valued envelope when the period has no
    transactions yet — the frontend can render either without choking."""
    p = DB / "reports" / f"{period}.json"
    if p.exists():
        return json.loads(p.read_text())

    # Compute on-the-fly. Avoids needing scripts/report.py to have been run.
    import sys
    repo_root = Path(__file__).resolve().parents[2]
    if str(repo_root / "scripts") not in sys.path:
        sys.path.insert(0, str(repo_root / "scripts"))
    try:
        from report import build_report  # type: ignore
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not import report builder: {e}")

    rep = build_report(period, DB)
    if rep.get("empty"):
        # Zero envelope — same shape the frontend expects, no transactions yet.
        return {
            "version": 1,
            "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
            "period": {"start": f"{period}-01", "end": f"{period}-01", "month": period},
            "accounts_included": [],
            "summary": {
                "total_income": 0,
                "total_spend": 0,
                "net_cashflow": 0,
                "savings_rate": None,
                "txn_count": 0,
            },
            "spend_by_category": [],
            "top_merchants_by_amount": [],
            "top_merchants_by_frequency": [],
            "subscriptions": {"active_count": 0, "monthly_cost_total": 0, "annual_cost_total": 0, "cancellation_candidates": []},
            "anomalies": [],
            "categories_added_this_period": [],
            "data_quality": {"uncategorized_count": 0, "missing_statements": [], "balance_mismatches": []},
            "narrative": f"No transactions yet for {period}.",
        }
    return rep


@app.get("/api/transactions")
def list_transactions(period: Optional[str] = None, category: Optional[str] = None, account: Optional[str] = None, limit: int = 500):
    txns = _read_json("transactions.json", [])
    if period:
        txns = [t for t in txns if t["date_posted"].startswith(period)]
    if category:
        txns = [t for t in txns if t.get("category") == category]
    if account:
        txns = [t for t in txns if t["account_id"] == account]
    txns.sort(key=lambda t: t["date_posted"], reverse=True)
    return txns[:limit]


@app.get("/api/categories")
def list_categories():
    return _read_json("categories.json", [])


@app.get("/api/merchants")
def list_merchants():
    return _read_json("merchants.json", [])


@app.get("/api/subscriptions")
def list_subscriptions():
    return _read_json("subscriptions.json", [])


ALLOWED_UPLOAD_EXTS = {".pdf", ".csv", ".html", ".htm", ".txt", ".tsv"}


@app.post("/api/upload")
async def upload_files(files: list[UploadFile] = File(...)):
    """Accept one or more statement files. Save each to inbox/_dropzone/
    so the on-disk inbox stays clean of any rename/dedup loops, and so
    the next ingest pass picks them up. Returns per-file status."""
    inbox = Path(_load_config()["inbox_path"])
    drop = inbox / "_dropzone"
    drop.mkdir(parents=True, exist_ok=True)

    saved: list[dict] = []
    for f in files:
        name = f.filename or "upload.bin"
        ext = Path(name).suffix.lower()
        if ext not in ALLOWED_UPLOAD_EXTS:
            saved.append({"filename": name, "status": "rejected", "reason": f"unsupported extension {ext}"})
            continue
        # Avoid clobbering: append (n) if the file already exists.
        target = drop / name
        n = 1
        while target.exists():
            target = drop / f"{Path(name).stem}-{n}{ext}"
            n += 1
        body = await f.read()
        target.write_bytes(body)
        saved.append({"filename": name, "stored_at": str(target.relative_to(inbox)), "bytes": len(body), "status": "saved"})
    return {"saved": [s for s in saved if s["status"] == "saved"], "rejected": [s for s in saved if s["status"] == "rejected"], "total": len(files)}


def _ingest_marker() -> Path:
    return DB / ".ingest_in_progress"


@app.get("/api/ingest/status")
def ingest_status():
    """Tell the frontend whether an ingest job is currently running.
    Used so a page refresh can pick up the in-flight job and keep
    showing "Processing…" instead of losing the message."""
    m = _ingest_marker()
    if not m.exists():
        return {"active": False}
    try:
        info = json.loads(m.read_text())
    except Exception:
        info = {}
    # Stale-marker safety: if the marker is older than 30 minutes, assume
    # the previous backend died mid-ingest and discard.
    started_at = info.get("started_at")
    if started_at:
        try:
            started_ts = datetime.datetime.fromisoformat(started_at.replace("Z", "+00:00"))
            age_min = (datetime.datetime.now(datetime.timezone.utc) - started_ts).total_seconds() / 60
            if age_min > 30:
                m.unlink(missing_ok=True)
                return {"active": False}
        except Exception:
            pass
    return {"active": True, **info}


@app.post("/api/ingest")
def trigger_ingest():
    """Run scripts/ingest.py once, synchronously, and return a brief
    summary. Drops a marker file at start so /api/ingest/status can
    report progress to a refreshed browser tab."""
    import subprocess
    repo_root = Path(_load_config().get("repo_root") or Path(__file__).resolve().parents[2])
    script = repo_root / "scripts" / "ingest.py"
    if not script.exists():
        raise HTTPException(status_code=500, detail=f"ingest.py not found at {script}")

    marker = _ingest_marker()
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text(json.dumps({
        "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }))

    try:
        result = subprocess.run(
            ["python3", str(script)],
            capture_output=True, text=True, timeout=1800, cwd=str(repo_root),
        )
    except subprocess.TimeoutExpired:
        marker.unlink(missing_ok=True)
        raise HTTPException(status_code=504, detail="ingest timed out after 30 minutes")
    finally:
        marker.unlink(missing_ok=True)

    return {
        "ok": result.returncode == 0,
        "exit_code": result.returncode,
        "stdout_tail": "\n".join(result.stdout.splitlines()[-40:]),
        "stderr_tail": "\n".join(result.stderr.splitlines()[-20:]),
    }


@app.get("/api/insights")
def insights():
    """Synthesize anomalies, subscriptions, utilization, contribution caps,
    new tax forms, and large recurring fees into one ranked feed for the
    Home tab. Each insight has a severity (info/low/medium/high) and an
    optional account/txn deep link."""
    txns = _read_json("transactions.json", [])
    stmts = _read_json("statements.json", [])
    anoms = _read_json("anomalies.json", [])
    subs = _read_json("subscriptions.json", [])
    accounts = _read_yaml(PERSONAL / "accounts.yaml").get("accounts", []) or []
    accts_by_id = {a["id"]: a for a in accounts}

    out: list[dict] = []

    # 1) Unreviewed anomalies — direct mapping
    for a in anoms:
        if a.get("reviewed_by_user"):
            continue
        flag = a.get("flag", "")
        sev_map = {
            "card_test": "high", "dup_billing": "high", "unwanted_merchant": "high",
            "large_txn": "medium", "outlier_amount": "medium", "free_trial_jump": "medium",
            "fee": "medium", "round_number_large": "medium",
            "foreign": "low", "new_merchant": "low", "late_night": "low",
        }
        out.append({
            "id": f"anom_{a['id']}",
            "severity": sev_map.get(flag, "low"),
            "category": "anomaly",
            "title": _flag_title(flag, a),
            "body": a.get("reason") or "",
            "account_id": None,
            "txn_id": a.get("txn_id"),
            "action_label": "Review",
            "action_url": None,
        })

    # 2) Subscription cancellation candidates
    for s in subs:
        tags = s.get("suggestion_tags") or []
        if not tags or s.get("status") != "active":
            continue
        out.append({
            "id": f"sub_{s['id']}",
            "severity": "medium" if "recent_price_increase" in tags or "overlap_streaming" in tags else "low",
            "category": "subscription",
            "title": f"Review {s.get('merchant_canonical') or 'subscription'}",
            "body": s.get("suggestion_reason") or ", ".join(tags),
            "account_id": s.get("primary_card_id"),
            "txn_id": None,
            "action_label": "Review",
            "action_url": None,
        })

    # 3) High credit utilization — derived from latest statements
    latest_by_acct: dict[str, dict] = {}
    for s in stmts:
        aid = s["account_id"]
        pe = s.get("period_end") or ""
        if aid not in latest_by_acct or pe > latest_by_acct[aid].get("period_end", ""):
            latest_by_acct[aid] = s

    for aid, s in latest_by_acct.items():
        cc = s.get("credit_card") or {}
        bal = s.get("ending_balance")
        limit = cc.get("credit_limit")
        if bal is None or limit is None or limit <= 0 or bal <= 0:
            continue
        util = (bal / limit) * 100
        if util < 70:
            continue
        a = accts_by_id.get(aid, {})
        out.append({
            "id": f"util_{aid}_{s.get('period_end')}",
            "severity": "high" if util >= 90 else "medium",
            "category": "utilization",
            "title": f"{a.get('nickname') or aid} at {util:.0f}% utilization",
            "body": f"Carrying ${bal:,.0f} of ${limit:,.0f} limit. Pay below 30% before the statement closes to keep your credit score from dipping.",
            "account_id": aid,
            "txn_id": None,
            "action_label": "Open card",
            "action_url": None,
        })

    # 4) Retirement contribution pace
    today = _date.today()
    months_remaining = max(1, 13 - today.month)  # rough: months left in calendar year
    for aid, s in latest_by_acct.items():
        r = s.get("retirement") or {}
        cap = r.get("annual_contribution_limit")
        ytd = r.get("ytd_contributions_total") or r.get("ytd_contributions_employee")
        if not cap or not ytd or cap <= 0:
            continue
        pct = (ytd / cap) * 100
        if pct >= 95:
            out.append({
                "id": f"contrib_full_{aid}",
                "severity": "info",
                "category": "contribution",
                "title": f"{accts_by_id.get(aid, {}).get('nickname') or aid} cap nearly hit",
                "body": f"${ytd:,.0f} of ${cap:,.0f} contributed this year ({pct:.0f}%). Watch for over-contributions on the next paycheck.",
                "account_id": aid,
                "action_label": "Open account",
            })
        elif today.month >= 9 and pct < 75:
            # Late in the year, well below cap → flag
            shortfall = cap - ytd
            need_per_month = shortfall / months_remaining
            out.append({
                "id": f"contrib_pace_{aid}",
                "severity": "low",
                "category": "contribution",
                "title": f"{accts_by_id.get(aid, {}).get('nickname') or aid} below pace",
                "body": f"${ytd:,.0f} of ${cap:,.0f} ({pct:.0f}%) with {months_remaining} month{'s' if months_remaining != 1 else ''} left — would need ~${need_per_month:,.0f}/month to max out.",
                "account_id": aid,
                "action_label": "Open account",
            })

    # 5) New tax forms available — surface once per (account, tax_year)
    for s in stmts:
        tf = s.get("tax_form")
        if not tf:
            continue
        out.append({
            "id": f"tax_{s['account_id']}_{tf.get('tax_year')}",
            "severity": "info",
            "category": "tax",
            "title": f"{tf.get('form_type', '1099')} for {tf.get('tax_year')} ready",
            "body": _tax_summary(tf),
            "account_id": s["account_id"],
            "action_label": "View",
        })

    # 6) Annual fees coming due (heuristic: any card with annual_fee > 0 and a recent statement)
    # Already surface as info — user has a single source of truth.
    for a in accounts:
        b = a.get("benefits") or {}
        af = b.get("annual_fee") or 0
        if af <= 0:
            continue
        out.append({
            "id": f"fee_{a['id']}",
            "severity": "info",
            "category": "fee",
            "title": f"{a.get('nickname')} — ${af}/yr fee",
            "body": "Confirm the annual perks (lounge, travel credit, etc.) cover the cost. Tap to see what's bundled and whether you've used it.",
            "account_id": a["id"],
            "action_label": "Open card",
        })

    # 7) Spending category outliers: this month vs trailing 3-month avg
    out.extend(_spending_outliers(txns))

    # Rank: high → medium → low → info, then dedup by id
    rank = {"high": 0, "medium": 1, "low": 2, "info": 3}
    seen = set()
    deduped = []
    for it in sorted(out, key=lambda x: rank.get(x["severity"], 9)):
        if it["id"] in seen:
            continue
        seen.add(it["id"])
        deduped.append(it)
    return deduped


def _flag_title(flag: str, a: dict) -> str:
    pretty = {
        "large_txn": "Unusually large charge",
        "outlier_amount": "Outlier amount",
        "fee": "Fee charged",
        "foreign": "Foreign transaction",
        "new_merchant": "New merchant",
        "dup_billing": "Possible duplicate billing",
        "card_test": "Card-test pattern",
        "late_night": "Late-night spending",
        "round_number_large": "Large round-number charge",
        "free_trial_jump": "Free trial converted to paid",
        "unwanted_merchant": "Merchant on your block list",
    }.get(flag, flag.replace("_", " "))
    m = a.get("merchant")
    return f"{pretty} — {m}" if m else pretty


def _tax_summary(tf: dict) -> str:
    parts = []
    div = tf.get("summary_total_dividends") or tf.get("div_ordinary")
    if div is not None:
        parts.append(f"${div:,.0f} dividends")
    intr = tf.get("summary_total_interest") or tf.get("int_income")
    if intr is not None and intr > 0:
        parts.append(f"${intr:,.0f} interest")
    gain = tf.get("summary_total_realized_gain_loss") or tf.get("b_total_gain_loss")
    if gain is not None:
        parts.append(f"${gain:,.0f} realized gain/loss")
    return ", ".join(parts) or "Year-end summary available."


def _spending_outliers(txns: list[dict]) -> list[dict]:
    """Flag categories whose current-month spend is >= 1.5x the trailing 3-month avg
    and >= $100 above. Reduces false positives on small categories."""
    if not txns:
        return []
    from collections import defaultdict
    today = _date.today()
    cur_month = today.strftime("%Y-%m")
    by_month_cat: dict[tuple[str, str], float] = defaultdict(float)
    for t in txns:
        if t.get("type") == "transfer":
            continue
        amt = t.get("amount") or 0
        if amt >= 0:
            continue
        m = t["date_posted"][:7]
        cat = t.get("category") or "uncategorized"
        by_month_cat[(m, cat)] += abs(amt)

    months = sorted({k[0] for k in by_month_cat.keys()}, reverse=True)
    if len(months) < 2:
        return []
    cur = cur_month
    prior_months = [m for m in months if m < cur][:3]
    if not prior_months:
        return []

    out = []
    for cat in {k[1] for k in by_month_cat.keys()}:
        cur_spend = by_month_cat.get((cur, cat), 0)
        if cur_spend < 100:
            continue
        prior_avg = sum(by_month_cat.get((m, cat), 0) for m in prior_months) / len(prior_months)
        if prior_avg <= 0 or cur_spend < prior_avg * 1.5:
            continue
        if cur_spend - prior_avg < 100:
            continue
        delta_pct = ((cur_spend - prior_avg) / prior_avg) * 100
        out.append({
            "id": f"outlier_{cur}_{cat}",
            "severity": "low",
            "category": "spending",
            "title": f"{cat.replace('_', ' ').title()} {delta_pct:.0f}% above usual",
            "body": f"${cur_spend:,.0f} this month vs ${prior_avg:,.0f}/mo trailing 3-month average. Worth a glance if it wasn't a planned spend.",
            "action_label": "Open spending",
        })
    return out


@app.get("/api/tax-forms")
def tax_forms():
    """Every statement record that carries a tax_form block, sorted newest first."""
    stmts = _read_json("statements.json", [])
    out = []
    for s in stmts:
        tf = s.get("tax_form")
        if not tf:
            continue
        out.append({
            "statement_id": s["id"],
            "account_id": s["account_id"],
            "institution": s["institution"],
            "issue_date": s.get("issue_date"),
            "period_start": s.get("period_start"),
            "period_end": s.get("period_end"),
            "tax_year": tf.get("tax_year"),
            "form_type": tf.get("form_type"),
            "form": tf,
        })
    out.sort(key=lambda x: (x.get("tax_year") or "", x.get("issue_date") or ""), reverse=True)
    return out


@app.get("/api/account-summaries")
def account_summaries():
    """Per-account derived summary used by the Cards tab.

    For each account: latest balance (from latest statement), credit limit and
    available credit (credit cards), last activity date, txn count over the
    trailing 12 months, monthly activity histogram (12 buckets, oldest→newest),
    and the set of statement period months we've seen.
    """
    accounts = _read_yaml(PERSONAL / "accounts.yaml").get("accounts", [])
    txns = _read_json("transactions.json", [])
    stmts = _read_json("statements.json", [])

    # Build per-account latest statement (by issue_date or period_end)
    def stmt_sort_key(s):
        return s.get("issue_date") or s.get("period_end") or ""
    stmts_sorted = sorted(stmts, key=stmt_sort_key)
    latest_stmt = {}
    for s in stmts_sorted:
        latest_stmt[s["account_id"]] = s

    # Build per-account txn buckets and metadata.
    from collections import defaultdict
    from datetime import date, timedelta
    today = date.today()
    # 12 months ago, anchored to first of month
    start_year = today.year - 1 if today.month == today.month else today.year
    months = []
    y, m = today.year, today.month
    for _ in range(12):
        months.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    months.reverse()  # oldest first

    by_acct_count = defaultdict(int)
    by_acct_last = {}
    by_acct_month_counts = defaultdict(lambda: {mo: 0 for mo in months})
    by_acct_stmt_periods = defaultdict(set)

    cutoff = (today.replace(day=1) - timedelta(days=365)).isoformat()
    for t in txns:
        aid = t["account_id"]
        date_str = t["date_posted"]
        if date_str >= cutoff:
            by_acct_count[aid] += 1
        bucket = date_str[:7]
        if bucket in by_acct_month_counts[aid]:
            by_acct_month_counts[aid][bucket] += 1
        prev = by_acct_last.get(aid)
        if not prev or date_str > prev:
            by_acct_last[aid] = date_str

    for s in stmts:
        by_acct_stmt_periods[s["account_id"]].add(
            (s.get("period_end") or s.get("issue_date") or "")[:7]
        )

    out = []
    for a in accounts:
        aid = a["id"]
        s = latest_stmt.get(aid)
        cc = (s or {}).get("credit_card") or {}
        balance = (s or {}).get("ending_balance")
        # Credit limit can be on the latest statement or on the account itself.
        credit_limit = cc.get("credit_limit") or a.get("credit_limit")
        available_credit = cc.get("available_credit")
        min_payment = cc.get("min_payment_due")
        due_date = cc.get("payment_due_date")
        last_activity = by_acct_last.get(aid)
        txn_count_12mo = by_acct_count[aid]
        # Monthly activity histogram: list[{month, count}]
        month_buckets = by_acct_month_counts[aid]
        monthly_activity = [{"month": mo, "count": month_buckets[mo]} for mo in months]
        statement_months = sorted(by_acct_stmt_periods[aid])

        out.append({
            "account_id": aid,
            "account_type": (s or {}).get("account_type") or a.get("type"),
            "balance": balance,
            "credit_limit": credit_limit,
            "available_credit": available_credit,
            "min_payment_due": min_payment,
            "payment_due_date": due_date,
            "last_activity": last_activity,
            "txn_count_12mo": txn_count_12mo,
            "monthly_activity": monthly_activity,
            "statement_months": statement_months,
            "latest_statement_period_end": (s or {}).get("period_end"),
            # Type-specific blocks from the latest statement (any of these may be null).
            "brokerage": (s or {}).get("brokerage"),
            "retirement": (s or {}).get("retirement"),
            "loan": (s or {}).get("loan"),
            "utility": (s or {}).get("utility"),
            "toll": (s or {}).get("toll"),
            "insurance": (s or {}).get("insurance"),
        })

    return out


@app.get("/api/transactions/{txn_id}/order")
def get_transaction_order(txn_id: str):
    """Return the matched order (Amazon, etc.) for a transaction, or null if no match."""
    txns = _read_json("transactions.json", [])
    t = next((x for x in txns if x["id"] == txn_id), None)
    if not t:
        raise HTTPException(status_code=404, detail="transaction not found")
    order_id = t.get("order_id")
    if not order_id:
        return None
    orders = _read_json("orders.json", [])
    return next((o for o in orders if o["order_id"] == order_id), None)


@app.get("/api/anomalies")
def list_anomalies(period: Optional[str] = None, unreviewed_only: bool = False):
    anoms = _read_json("anomalies.json", [])
    if period:
        txn_ids = {t["id"] for t in _read_json("transactions.json", []) if t["date_posted"].startswith(period)}
        anoms = [a for a in anoms if a["txn_id"] in txn_ids]
    if unreviewed_only:
        anoms = [a for a in anoms if not a.get("reviewed_by_user")]
    return anoms


# ---------- benefits + recommendations ----------


def _cards_with_benefits() -> list[dict]:
    accounts = _read_yaml(PERSONAL / "accounts.yaml").get("accounts", []) or []
    return [a for a in accounts if a.get("type") == "credit_card" and a.get("benefits")]


def _category_match_for_txn(txn_category_id: Optional[str], match: str) -> bool:
    """Does a benefit's `match` apply to a transaction's category id?

    `match` is either a category id (e.g. "groceries", "flights") or "*" (catch-all).
    A benefit category matches a transaction if their ids are equal OR if the
    transaction's category is a child of the benefit category (parent walk handled
    via category list lookup, but for v1 we keep it simple: equality + "*").
    """
    if match == "*":
        return True
    return (txn_category_id or "") == match


def _all_offers_for_match(cards: list[dict], match_key: str) -> list[dict]:
    """Return one offer per card that lists this exact `match` key, sorted by
    effective cents per dollar (best first). When a card has multiple entries
    for the same match (e.g. two `*` rules with different scopes), the highest
    effective rate is kept."""
    out: list[dict] = []
    for card in cards:
        b = card.get("benefits", {})
        ptv = float(b.get("points_value_cents", 1.0))
        best_for_card: Optional[dict] = None
        for cat in b.get("categories", []) or []:
            if cat["match"] != match_key:
                continue
            rate = float(cat["rate"])
            unit = cat.get("unit", "x")
            scope = cat.get("scope")
            effective = round(rate * ptv, 2) if unit in ("x", "X") else round(rate, 2)
            offer = {
                "card_id": card["id"],
                "card_nickname": card["nickname"],
                "rate": rate,
                "unit": unit,
                "scope": scope,
                "effective_cents_per_dollar": effective,
            }
            if best_for_card is None or offer["effective_cents_per_dollar"] > best_for_card["effective_cents_per_dollar"]:
                best_for_card = offer
        if best_for_card:
            out.append(best_for_card)
    out.sort(key=lambda x: x["effective_cents_per_dollar"], reverse=True)
    return out


def _best_offer_for_category(cards: list[dict], txn_category_id: Optional[str]) -> dict:
    """Return the best (rate, card_id) pair for a given category across all cards.

    "Best" is highest rate * points_value_cents (so 2x at 2c beats 4x at 0.5c).
    Each card's `*` catch-all is the floor; specific category matches override.
    """
    best = None
    for card in cards:
        b = card.get("benefits", {})
        ptv = float(b.get("points_value_cents", 1.0))
        chosen_rate = None
        chosen_scope = None
        for cat in b.get("categories", []) or []:
            if _category_match_for_txn(txn_category_id, cat["match"]):
                rate = float(cat["rate"])
                if chosen_rate is None or rate > chosen_rate:
                    chosen_rate = rate
                    chosen_scope = cat.get("scope")
        if chosen_rate is None:
            continue
        effective = chosen_rate * ptv
        offer = {
            "card_id": card["id"],
            "card_nickname": card["nickname"],
            "rate": chosen_rate,
            "points_value_cents": ptv,
            "effective_cents_per_dollar": round(effective, 2),
            "scope": chosen_scope,
        }
        if best is None or effective > best["effective_cents_per_dollar"]:
            best = offer
    return best or {}


@app.get("/api/benefits")
def get_benefits():
    cards = _cards_with_benefits()
    if not cards:
        return {"cards": [], "category_rewards": [], "perks": [], "annual_fees_total": 0}

    # Per-card summary
    card_summaries = [
        {
            "id": c["id"],
            "nickname": c["nickname"],
            "annual_fee": c["benefits"].get("annual_fee", 0),
            "points_value_cents": c["benefits"].get("points_value_cents"),
        }
        for c in cards
    ]

    # Best card per reward category, with the full per-card offer list so the UI
    # can show "all eligible cards" for that category.
    seen_keys = set()
    category_rewards = []
    for card in cards:
        for cat in card["benefits"].get("categories", []) or []:
            key = cat["match"]
            if key in seen_keys:
                continue
            seen_keys.add(key)
            offers = _all_offers_for_match(cards, key)
            if not offers:
                continue
            winner = offers[0]
            category_rewards.append({
                "match": key,
                "scope": winner["scope"],
                "best_rate": winner["rate"],
                "best_unit": winner["unit"],
                "best_card_id": winner["card_id"],
                "best_card_nickname": winner["card_nickname"],
                "effective_cents_per_dollar": winner["effective_cents_per_dollar"],
                "all_offers": offers,
            })

    # Dedup perks by name across cards. Description/url come from whichever card listed them
    # first (or the longest description if multiple).
    perks_by_name: dict[str, dict] = {}
    for card in cards:
        for perk in card["benefits"].get("perks", []) or []:
            name = perk["name"]
            entry = perks_by_name.setdefault(name, {
                "name": name,
                "group": perk.get("group"),
                "annual": perk.get("annual", False),
                "description": perk.get("description"),
                "how_to_use_url": perk.get("how_to_use_url"),
                "providers": [],
            })
            entry["providers"].append({"id": card["id"], "nickname": card["nickname"]})
            # Take the longest description across providers
            if perk.get("description") and len(perk["description"]) > len(entry.get("description") or ""):
                entry["description"] = perk["description"]
            if perk.get("how_to_use_url") and not entry.get("how_to_use_url"):
                entry["how_to_use_url"] = perk["how_to_use_url"]

    return {
        "cards": card_summaries,
        "category_rewards": category_rewards,
        "perks": list(perks_by_name.values()),
        "annual_fees_total": sum(c["benefits"].get("annual_fee", 0) for c in cards),
    }


@app.get("/api/recommendations")
def recommendations(period: Optional[str] = None):
    """Per-transaction missed-rewards. Empty when fewer than 2 cards have benefits."""
    cards = _cards_with_benefits()
    if len(cards) < 2:
        return {
            "period": period,
            "single_card_mode": True,
            "items": [],
            "total_missed_dollars": 0,
        }

    cards_by_id = {c["id"]: c for c in cards}
    txns = _read_json("transactions.json", [])
    if period:
        txns = [t for t in txns if t["date_posted"].startswith(period)]

    items = []
    total_missed = 0.0
    for t in txns:
        if t["amount"] >= 0:
            continue  # only outflows earn rewards
        if t.get("type") in ("transfer", "interest", "fee"):
            continue
        actual_card = cards_by_id.get(t["account_id"])
        if not actual_card:
            continue
        actual_offer = _best_offer_for_category([actual_card], t.get("category"))
        best_offer = _best_offer_for_category(cards, t.get("category"))
        if not actual_offer or not best_offer:
            continue
        if best_offer["card_id"] == actual_offer.get("card_id"):
            continue
        spend = abs(t["amount"])
        actual_value = spend * actual_offer["effective_cents_per_dollar"] / 100
        best_value = spend * best_offer["effective_cents_per_dollar"] / 100
        missed = best_value - actual_value
        if missed < 0.01:
            continue
        total_missed += missed
        items.append({
            "txn_id": t["id"],
            "date": t["date_posted"],
            "merchant": t.get("merchant_canonical"),
            "amount": t["amount"],
            "category": t.get("category"),
            "used_card_id": actual_card["id"],
            "used_card_nickname": actual_card["nickname"],
            "better_card_id": best_offer["card_id"],
            "better_card_nickname": best_offer["card_nickname"],
            "missed_dollars": round(missed, 2),
        })
    items.sort(key=lambda x: -x["missed_dollars"])
    return {
        "period": period,
        "single_card_mode": False,
        "items": items,
        "total_missed_dollars": round(total_missed, 2),
    }


# ---------- writes (txn category, new category) ----------


class SubscriptionOverride(BaseModel):
    merchant: str
    action: str  # "dismiss" | "include"
    cadence: Optional[str] = None  # "monthly" | "quarterly" | "annual" — only for include


@app.post("/api/subscriptions/dismiss/{sub_id}")
def dismiss_subscription(sub_id: str):
    """Mark a detected subscription as not-a-subscription. Removes it from
    db/subscriptions.json AND appends a 'dismiss' override to personal/
    subscription_overrides.yaml so subsequent ingests respect the call."""
    subs_path = DB / "subscriptions.json"
    subs = _read_json("subscriptions.json", [])
    target = next((s for s in subs if s.get("id") == sub_id), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Subscription not found: {sub_id}")
    merchant = target["merchant_canonical"]
    _add_subscription_override(merchant, "dismiss", None)
    new_subs = [s for s in subs if s.get("id") != sub_id]
    _atomic_write_json(subs_path, new_subs)
    return {"ok": True, "removed": merchant, "remaining": len(new_subs)}


@app.post("/api/subscriptions/include")
def include_subscription(payload: SubscriptionOverride):
    """Force a merchant to be treated as a subscription. Appends an 'include'
    override and adds a stub entry to db/subscriptions.json built from the
    user's existing transactions for that merchant."""
    if not payload.merchant.strip():
        raise HTTPException(status_code=400, detail="merchant required")
    cadence = payload.cadence or "monthly"
    if cadence not in ("monthly", "quarterly", "annual"):
        raise HTTPException(status_code=400, detail="cadence must be monthly|quarterly|annual")
    _add_subscription_override(payload.merchant, "include", cadence)

    # Build a stub from existing transactions if any.
    txns = _read_json("transactions.json", [])
    matches = [t for t in txns if (t.get("merchant_canonical") or "").strip().lower() == payload.merchant.strip().lower() and (t.get("amount") or 0) < 0]
    if not matches:
        return {"ok": True, "merchant": payload.merchant, "note": "Override saved; no matching transactions yet — will be picked up on next ingest."}

    matches.sort(key=lambda t: t["date_posted"])
    amounts = sorted(abs(t["amount"]) for t in matches)
    median = amounts[len(amounts) // 2]
    annual = median * (12 if cadence == "monthly" else 4 if cadence == "quarterly" else 1)
    card_counts: dict = {}
    for t in matches:
        card_counts[t["account_id"]] = card_counts.get(t["account_id"], 0) + 1

    stub = {
        "id": f"{_safe_sub_id(payload.merchant)}_user",
        "merchant_canonical": payload.merchant,
        "category": matches[-1].get("category"),
        "cadence": cadence,
        "median_amount": round(median, 2),
        "current_amount": round(abs(matches[-1]["amount"]), 2),
        "first_seen": matches[0]["date_posted"],
        "last_seen": matches[-1]["date_posted"],
        "charge_count": len(matches),
        "charge_count_12mo": len(matches),
        "monthly_cost": round(annual / 12, 2),
        "annual_cost": round(annual, 2),
        "last_price_change": None,
        "primary_card_id": max(card_counts, key=card_counts.get),
        "card_counts": card_counts,
        "txn_ids": [t["id"] for t in matches],
        "suggestion_tags": [],
        "suggestion_reason": "Manually marked as subscription.",
        "status": "active",
        "user_added": True,
    }
    subs = _read_json("subscriptions.json", [])
    # Replace any existing entry for the same merchant.
    subs = [s for s in subs if s["merchant_canonical"].strip().lower() != payload.merchant.strip().lower()]
    subs.append(stub)
    _atomic_write_json(DB / "subscriptions.json", subs)
    return {"ok": True, "merchant": payload.merchant, "stub": stub}


def _add_subscription_override(merchant: str, action: str, cadence: Optional[str]):
    p = PERSONAL / "subscription_overrides.yaml"
    cfg: dict
    if p.exists():
        try:
            cfg = yaml.safe_load(p.read_text()) or {}
        except Exception:
            cfg = {}
    else:
        cfg = {}
    overrides = cfg.get("overrides") or []
    # Drop any prior override for this merchant — last write wins.
    overrides = [o for o in overrides if (o.get("merchant") or "").strip().lower() != merchant.strip().lower()]
    entry = {"merchant": merchant, "action": action}
    if cadence:
        entry["cadence"] = cadence
    overrides.append(entry)
    cfg["overrides"] = overrides
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(yaml.safe_dump(cfg, sort_keys=False, default_flow_style=False, allow_unicode=True))


def _safe_sub_id(merchant: str) -> str:
    slug = re.sub(r"[^a-z0-9_-]+", "_", merchant.lower())
    slug = re.sub(r"_+", "_", slug).strip("_")
    return f"sub_{slug[:30]}"


def _atomic_write_json(path: Path, data) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    tmp.replace(path)


class AccountUpdate(BaseModel):
    nickname: Optional[str] = None
    login_url: Optional[str] = None
    notes: Optional[str] = None


@app.post("/api/accounts/{account_id}")
def update_account(account_id: str, payload: AccountUpdate):
    """Edit a few user-facing fields on accounts.yaml. Only nickname,
    login_url, and notes are user-editable; everything else is derived
    from statements."""
    p = PERSONAL / "accounts.yaml"
    if not p.exists():
        raise HTTPException(status_code=404, detail="accounts.yaml not found")
    data = _read_yaml(p)
    accounts = data.get("accounts") or []
    target = next((a for a in accounts if a.get("id") == account_id), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Account not found: {account_id}")
    if payload.nickname is not None:
        target["nickname"] = payload.nickname.strip() or target.get("nickname")
    if payload.login_url is not None:
        cleaned = payload.login_url.strip()
        if cleaned:
            target["login_url"] = cleaned
        elif "login_url" in target:
            del target["login_url"]
    if payload.notes is not None:
        cleaned = payload.notes.strip()
        if cleaned:
            target["notes"] = cleaned
        elif "notes" in target:
            del target["notes"]
    p.write_text(yaml.safe_dump(data, sort_keys=False, default_flow_style=False, allow_unicode=True))
    return {"ok": True, "account": target}


class TxnCategoryUpdate(BaseModel):
    category_id: str
    apply_to_merchant: bool = True


@app.post("/api/transactions/{txn_id}/category")
def update_transaction_category(txn_id: str, payload: TxnCategoryUpdate):
    """Set this transaction's category. If apply_to_merchant, also update every
    other transaction with the same merchant_canonical."""
    cats = _read_json("categories.json", [])
    if payload.category_id not in {c["id"] for c in cats}:
        raise HTTPException(status_code=400, detail=f"Unknown category_id: {payload.category_id}")

    txns = _read_json("transactions.json", [])
    target = next((t for t in txns if t["id"] == txn_id), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Transaction not found: {txn_id}")

    merchant = target.get("merchant_canonical")
    updated = 0
    for t in txns:
        if t["id"] == txn_id or (payload.apply_to_merchant and merchant and t.get("merchant_canonical") == merchant):
            t["category"] = payload.category_id
            t["category_confidence"] = 1.0
            t["categorized_by"] = "manual"
            updated += 1

    _write_json_atomic("transactions.json", txns)
    return {"ok": True, "updated": updated, "merchant": merchant if payload.apply_to_merchant else None}


class NewCategory(BaseModel):
    id: str
    name: str
    parent: Optional[str] = None


@app.post("/api/categories")
def add_category(payload: NewCategory):
    cats = _read_json("categories.json", [])
    if any(c["id"] == payload.id for c in cats):
        raise HTTPException(status_code=400, detail=f"Category already exists: {payload.id}")
    # Soft similarity check: refuse if any existing name is a substring or vice versa
    new_name = payload.name.lower()
    for c in cats:
        cn = (c.get("name") or c["id"]).lower()
        if cn == new_name:
            raise HTTPException(status_code=400, detail=f"Category with name '{payload.name}' already exists as id '{c['id']}'")
    cats.append({
        "id": payload.id,
        "name": payload.name,
        "parent": payload.parent,
        "aliases": [],
        "created_by": "user",
        "created_at": datetime.datetime.utcnow().isoformat() + "Z",
        "frozen": False,
        "example_merchants": [],
    })
    _write_json_atomic("categories.json", cats)
    return {"ok": True, "category": cats[-1]}


# ---------- writes (anomaly review) ----------

class AnomalyAction(BaseModel):
    action: str  # one of: kept | dismissed | investigated


@app.post("/api/anomalies/{anomaly_id}/review")
def review_anomaly(anomaly_id: str, payload: AnomalyAction):
    if payload.action not in ("kept", "dismissed", "investigated"):
        raise HTTPException(status_code=400, detail="action must be kept|dismissed|investigated")
    anoms = _read_json("anomalies.json", [])
    found = False
    for a in anoms:
        if a["id"] == anomaly_id:
            a["reviewed_by_user"] = True
            a["user_action"] = payload.action
            a["reviewed_at"] = datetime.datetime.utcnow().isoformat() + "Z"
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="anomaly not found")
    _write_json_atomic("anomalies.json", anoms)
    return {"ok": True, "anomaly_id": anomaly_id, "action": payload.action}


# ---------- static frontend ----------

# Serve the built PWA at / (only if it exists; during development the Vite dev
# server serves the frontend instead).
if FRONTEND_DIST.exists() and (FRONTEND_DIST / "index.html").exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
else:
    @app.get("/")
    def root_placeholder():
        return {
            "ok": True,
            "note": "Frontend not built yet. Run `cd web/frontend && npm install && npm run build`, or use the Vite dev server at http://localhost:5173.",
        }
