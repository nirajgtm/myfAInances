#!/usr/bin/env python3
"""
ingest.py: Process statements from the configured inbox.

Reads config, scans inbox, dispatches each file to its institution parser,
writes records to the JSON DB atomically, archives the file, generates reports.

Usage:
  python3 scripts/ingest.py                 # process all eligible files in inbox
  python3 scripts/ingest.py <file.pdf>      # process a specific file

Config resolution (in order):
  1. $FINANCE_CONFIG env var
  2. ~/.config/finance/data_root  (one-line file with the data root)
  3. ~/claude-configs/finance-data/config.yaml
"""

from __future__ import annotations

import os
import re
import sys
import json
import html
import hashlib
import shutil
import subprocess
import datetime
from pathlib import Path
from types import SimpleNamespace

import yaml
import pypdf

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))

from parser import parse as llm_parse, anomaly_reason  # noqa: E402


# ---------- normalization, alias resolution, categorization, anomaly tagging ----------


def normalize_description(raw: str) -> str:
    """Uppercase, collapse whitespace, insert spaces at letter/digit boundaries.

    Many bank PDFs jam tokens together (e.g., 'FEE800-555-1234TN', 'EXAMPLE.COMSINGAPORE').
    The boundary insertion makes word-boundary regex matching reliable.
    """
    s = re.sub(r"\s+", " ", raw.upper()).strip()
    s = re.sub(r"(?<=[A-Z])(?=[0-9])", " ", s)
    s = re.sub(r"(?<=[0-9])(?=[A-Z])", " ", s)
    return s


def resolve_merchant(desc_raw: str, desc_norm: str, aliases_cfg: dict) -> str | None:
    """Return canonical merchant name. Prefer alias rule; else best-effort prefix."""
    for entry in aliases_cfg.get("aliases", []):
        m = re.search(entry["pattern"], desc_raw)
        if m:
            canonical = entry["canonical"]
            # Substitute capture groups: $1, $2, ...
            for i, g in enumerate(m.groups(), 1):
                if g is not None:
                    canonical = canonical.replace(f"${i}", g)
            return canonical.strip().title() if canonical.isupper() else canonical.strip()
    # Heuristic fallback: take the leading alphabetic words of the description
    # before any digit run, then trim trailing 2-letter state code.
    words = re.split(r"\d", desc_norm, maxsplit=1)[0].strip()
    words = re.sub(r"\s+[A-Z]{2}$", "", words)  # trailing state
    if not words:
        return None
    # Title-case but keep small caps for short tokens
    return " ".join(w.capitalize() if len(w) > 2 else w for w in words.split())


def load_rules(repo_root: Path, personal_path: Path) -> list[dict]:
    """Merge default-rules.yaml and personal/categorization.yaml, sort by priority."""
    defaults = load_yaml(repo_root / "skill/categorization/default-rules.yaml")
    personal = load_yaml(personal_path / "categorization.yaml")
    rules = list(defaults.get("rules", [])) + list(personal.get("rules", []))
    rules.sort(key=lambda r: r.get("priority", 1000))
    return rules


def apply_rules(txn: dict, rules: list[dict]) -> tuple[str | None, float, bool, str | None]:
    """Return (category_id, confidence, tag_subscription, tax_tag) or (None, 0, False, None)."""
    desc = txn["description_normalized"]
    for r in rules:
        if "description_regex" not in r:
            continue
        if re.search(r["description_regex"], desc):
            return (
                r.get("category_id"),
                1.0,
                bool(r.get("tag_subscription", False)),
                r.get("tax_tag"),
            )
    return None, 0.0, False, None


def tag_anomaly_flags(txn: dict, cfg: dict, alerts_cfg: dict, is_first_ever: bool) -> list[str]:
    flags: list[str] = []
    amount_abs = abs(txn["amount"])
    desc = txn["description_normalized"]

    if txn["type"] == "fee" or re.search(
        r"\b(ATM|FOREIGN|OVERDRAFT|NSF|LATE|RETURNED|MAINTENANCE|WIRE|SERVICE)\s*FEE\b",
        desc,
    ) or re.search(r"\bFEE\b", desc) and any(
        kw in desc for kw in ("LATE", "OVERDRAFT", "NSF", "WIRE", "ATM", "FOREIGN", "SERVICE", "MAINTENANCE", "RETURNED")
    ):
        flags.append("fee")

    if txn.get("is_foreign"):
        flags.append("foreign")

    if amount_abs >= float(cfg.get("large_txn_threshold", 500)) and txn["amount"] < 0:
        flags.append("large_txn")

    if amount_abs >= 500 and amount_abs == int(amount_abs) and int(amount_abs) % 100 == 0:
        flags.append("round_number_large")

    # block list
    for entry in alerts_cfg.get("block", []) or []:
        if re.search(entry["merchant"], desc):
            flags.append("unwanted_merchant")
            break

    # always-flag
    for pat in alerts_cfg.get("flag_always", []) or []:
        if re.search(pat, desc):
            if "always_flagged" not in flags:
                flags.append("always_flagged")

    # mute filter
    muted: set[str] = set()
    for entry in alerts_cfg.get("mute", []) or []:
        if re.search(entry["merchant"], desc):
            for f in entry.get("flags", []):
                muted.add(f)
    flags = [f for f in flags if f not in muted]

    return flags


def detect_foreign(desc_raw: str) -> bool:
    """Heuristic for foreign transactions when the parser does not set is_foreign."""
    foreign_locales = (
        "SINGAPORE", "LONDON", "PARIS", "TOKYO", "BERLIN", "MEXICO", "CANADA",
        "INDIA", "NEPAL", "DUBAI", "HONGKONG", "HONG KONG", "AMSTERDAM",
    )
    upper = desc_raw.upper()
    return any(loc in upper for loc in foreign_locales)


def compute_txn_id(account_id: str, date_posted: str, amount: float, desc_norm: str, seq: int) -> str:
    key = f"{account_id}|{date_posted}|{amount:.2f}|{desc_norm[:40]}|{seq}"
    return "txn_" + hashlib.sha256(key.encode()).hexdigest()[:12]


def finalize_transactions(
    raw_txns: list[dict],
    statement_id: str,
    rules: list[dict],
    aliases_cfg: dict,
    cfg: dict,
    alerts_cfg: dict,
    is_first_ever: bool,
) -> list[dict]:
    """Mutate-in-place and return finalized transactions ready for DB insert."""
    # Same-day same-amount sequence counter for txn_id stability
    seq_seen: dict[tuple, int] = {}
    finalized: list[dict] = []

    for raw in raw_txns:
        desc_norm = normalize_description(raw["description_raw"])
        merchant = resolve_merchant(raw["description_raw"], desc_norm, aliases_cfg)

        cat_id, cat_conf, sub_flag, tax_tag = apply_rules({**raw, "description_normalized": desc_norm}, rules)

        if raw.get("is_foreign") is None:
            raw["is_foreign"] = detect_foreign(raw["description_raw"])

        seq_key = (raw["account_id"], raw["date_posted"], raw["amount"], desc_norm[:40])
        seq = seq_seen.get(seq_key, 0)
        seq_seen[seq_key] = seq + 1

        txn = {
            "id": compute_txn_id(raw["account_id"], raw["date_posted"], raw["amount"], desc_norm, seq),
            "account_id": raw["account_id"],
            "statement_id": statement_id,
            "source": raw.get("source", "statement"),
            "source_format": raw.get("source_format", "pdf"),
            "date_posted": raw["date_posted"],
            "date_transaction": raw["date_transaction"],
            "amount": raw["amount"],
            "currency": raw.get("currency", "USD"),
            "fx_rate": raw.get("fx_rate"),
            "is_foreign": raw["is_foreign"],
            "description_raw": raw["description_raw"],
            "description_normalized": desc_norm,
            "merchant_canonical": merchant,
            "type": raw["type"],
            "check_number": raw.get("check_number"),
            "reference_id": raw.get("reference_id"),
            "category": cat_id,
            "category_confidence": cat_conf,
            "categorized_by": "rule" if cat_id else None,
            "tax_tag": tax_tag,
            "transfer_pair_id": None,
            "balance_after": raw.get("balance_after"),
            "subscription_id": None,
            "subscription_candidate": sub_flag,
            "anomaly_flags": [],
        }
        txn["anomaly_flags"] = tag_anomaly_flags(txn, cfg, alerts_cfg, is_first_ever)
        finalized.append(txn)
    return finalized


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


def load_yaml(path: Path) -> dict:
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text()) or {}


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text())


def save_json_atomic(path: Path, data) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    os.replace(tmp, path)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _process_orders(pdf_path: Path, file_hash: str, cfg: dict, parsed: dict, processed: dict) -> dict:
    """Persist Amazon (or other vendor) orders into db/orders.json with order-id dedup."""
    db_path = Path(cfg["db_path"])
    inbox = Path(cfg["inbox_path"])
    vendor = parsed.get("vendor", "amazon")

    orders_db_path = db_path / "orders.json"
    orders_db = load_json(orders_db_path, [])
    existing_ids = {o["order_id"] for o in orders_db}

    now = datetime.datetime.utcnow().isoformat() + "Z"
    new_orders = []
    for o in parsed.get("orders", []):
        if not o.get("order_id"):
            continue
        if o["order_id"] in existing_ids:
            continue
        order = {
            "order_id": o["order_id"],
            "vendor": vendor,
            "date_placed": o.get("date_placed"),
            "total": o.get("total"),
            "items": o.get("items", []),
            "ship_to": o.get("ship_to"),
            "delivered_on": o.get("delivered_on"),
            "payment_card_last4": o.get("payment_card_last4"),
            "raw_block": o.get("raw_block"),
            "matched_txn_id": None,
            "source_file_hash": file_hash,
            "source_filename": pdf_path.name,
            "ingested_at": now,
        }
        orders_db.append(order)
        new_orders.append(order)
        existing_ids.add(o["order_id"])

    save_json_atomic(orders_db_path, orders_db)

    processed[file_hash] = {
        "envelope_type": "orders",
        "vendor": vendor,
        "filename": pdf_path.name,
        "ingested_at": now,
        "order_count": len(new_orders),
    }
    save_json_atomic(db_path / "processed.json", processed)

    # Organize: inbox/<vendor>/<YYYY-MM>.pdf
    period_yyyymm = (parsed.get("period_end") or "unknown")[:7]
    target_dir = inbox / vendor
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{period_yyyymm}{pdf_path.suffix.lower()}"
    if target.exists() and target.resolve() != pdf_path.resolve():
        n = 2
        while True:
            cand = target_dir / f"{period_yyyymm}-{n}{pdf_path.suffix.lower()}"
            if not cand.exists():
                target = cand
                break
            n += 1
    if target.resolve() != pdf_path.resolve():
        shutil.move(str(pdf_path), str(target))
        print(f"  Stored at: inbox/{target.relative_to(inbox)}")
    print(f"  Inserted: {len(new_orders)} new {vendor} order(s) (skipped {len(parsed.get('orders', [])) - len(new_orders)} dups by order_id)")
    return {"status": "ingested", "envelope_type": "orders", "orders_count": len(new_orders)}


def clean_merchants(db_path: Path) -> int:
    """Post-process merchant_canonical to strip processor/ACH prefixes and trailing locales.

    Returns number of transactions whose merchant_canonical changed.
    """
    txns = load_json(db_path / "transactions.json", [])
    changed = 0

    # Patterns to strip (case-insensitive). Order matters - longer first.
    PREFIX_PATTERNS = [
        r"^EFT\s*ACH\s+",
        r"^ACH\s+",
        r"^WEB\s*PMTS?\s+",
        r"^WEB\s+",
        r"^DEBIT\s+",
        r"^DDA\s+",
        r"^POS\s+",
        r"^WITHDRAWAL\s+",
        r"^CHECKCARD\s+",
        r"^DEPOSIT\s+",
    ]
    # Square / Toast / SpotOn / PayPal-style processor prefixes "SQ*X", "TST*X", "SP*X", "PAYPAL *X"
    PROCESSOR_PATTERNS = [
        (r"^SQ\s*\*\s*", ""),
        (r"^TST\s*\*\s*", ""),
        (r"^SP\s*\*\s*", ""),
        (r"^SPO\s*\*\s*", ""),
        (r"^PAYPAL\s*\*\s*", ""),
        (r"^AMZN\s*MKTP\s+", "Amazon - "),
        (r"^AMAZON\.COM\s+", "Amazon - "),
        (r"^AMZN\s+", "Amazon - "),
    ]
    # Trailing 2-letter US state code (preceded by capitalized words/digits/space)
    TRAILING_STATE = re.compile(r"\s+(?:[A-Z]{2}|[A-Za-z]{2,})$")

    def clean(name: str) -> str:
        s = name.strip()
        # Strip prefixes
        for pat in PREFIX_PATTERNS:
            s = re.sub(pat, "", s, flags=re.IGNORECASE).strip()
        # Strip processor prefixes
        for pat, repl in PROCESSOR_PATTERNS:
            new = re.sub(pat, repl, s, flags=re.IGNORECASE)
            if new != s:
                s = new.strip()
                break
        # Drop trailing 800/888 phone prefix and following digits
        s = re.sub(r"\s+\d{3}[-.\s]?\d{3}[-.\s]?\d{4}.*$", "", s)
        s = re.sub(r"\s+\d{10,}.*$", "", s)
        # Cleanup: collapse whitespace
        s = re.sub(r"\s+", " ", s).strip()
        # Title-case if SHOUTY (>4 chars all-caps)
        if s and s == s.upper() and len(s) > 4:
            s = " ".join(w.capitalize() if len(w) > 2 else w for w in s.split())
        return s

    for t in txns:
        old = t.get("merchant_canonical")
        if not old:
            continue
        new = clean(old)
        if new and new != old:
            t["merchant_canonical"] = new
            changed += 1

    if changed:
        save_json_atomic(db_path / "transactions.json", txns)
    return changed


def enrich_metadata(db_path: Path) -> int:
    """Backfill merchant_city/state/country/payment_method on existing transactions
    by parsing description_raw with a single batched Claude call. Cheap because
    we only enrich rows where the metadata is missing.

    Returns number of transactions enriched.
    """
    if not shutil.which("claude"):
        return 0
    txns = load_json(db_path / "transactions.json", [])
    pending = [
        t for t in txns
        if t.get("description_raw")
        and not t.get("merchant_city")
        and not t.get("merchant_state")
        and t.get("type") not in ("transfer", "interest")
    ]
    if not pending:
        return 0

    # Batch in chunks so one bad LLM response doesn't lose everything.
    BATCH = 50
    total = 0
    for i in range(0, len(pending), BATCH):
        batch = pending[i:i + BATCH]
        records = [{"id": t["id"], "raw": t["description_raw"]} for t in batch]
        user_msg = (
            "From each raw transaction description below, extract location and payment-method "
            "fields. Return ONLY this JSON: "
            '{"results":[{"id":"...","merchant_city":"...","merchant_state":"...","merchant_country":"...","merchant_phone":"...","payment_method":"..."}, ...]}\n\n'
            "Rules:\n"
            "- merchant_state is a 2-letter US state code if visible (e.g. CA, NY).\n"
            "- merchant_city is the city as printed (case may need normalizing).\n"
            "- merchant_country only if non-US country is visible (Singapore, UK, etc.).\n"
            "- merchant_phone if a US phone number is embedded (e.g. 800-555-1212).\n"
            "- payment_method one of: ACH, POS, CheckCard, ATM, Wire, Online, Mobile, Recurring, or null. Infer from prefixes (\"EFT ACH\" -> ACH, \"POS\" -> POS, \"WITHDRAWAL\" -> ATM if applicable).\n"
            "- All fields null if not present. Don't guess.\n\n"
            "Records:\n" + json.dumps(records, indent=0)
        )
        cmd = ["claude", "-p", user_msg, "--output-format", "json", "--model", "opus", "--allowedTools", ""]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        except subprocess.TimeoutExpired:
            continue
        if result.returncode != 0:
            continue
        try:
            wrapper = json.loads(result.stdout)
            text = wrapper.get("result", "").strip()
            if text.startswith("```"):
                m = re.match(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.S)
                if m: text = m.group(1).strip()
            data = json.loads(text)
        except (json.JSONDecodeError, KeyError):
            continue
        by_id = {t["id"]: t for t in txns}
        for r in data.get("results", []) or []:
            t = by_id.get(r.get("id"))
            if not t:
                continue
            for field in ("merchant_city", "merchant_state", "merchant_country", "merchant_phone", "payment_method"):
                v = r.get(field)
                if v and not t.get(field):
                    t[field] = v
                    total += 1
    if total:
        save_json_atomic(db_path / "transactions.json", txns)
    return total


def _safe_sub_id(merchant: str) -> str:
    """Build a URL-path-safe subscription ID from a merchant name. Drops any
    char that isn't [a-z0-9_-] so the id can be used directly in URL paths
    without encoding surprises."""
    slug = re.sub(r"[^a-z0-9_-]+", "_", merchant.lower())
    slug = re.sub(r"_+", "_", slug).strip("_")
    return f"sub_{slug[:30]}"


def detect_subscriptions(db_path: Path) -> int:
    """Detect recurring charges and write to db/subscriptions.json. Returns count of detected subs.

    Heuristic:
      - Group by merchant_canonical (case-insensitive)
      - Need >= 2 charges
      - Gaps between charges suggest cadence: monthly (28-32d), annual (350-380d), quarterly (88-95d)
      - Amount drift < 50% of median
      - Skip transfers, fees, interest, dividends
    """
    txns = load_json(db_path / "transactions.json", [])
    by_merchant: dict[str, list] = {}
    for t in txns:
        if t.get("type") in ("transfer", "fee", "interest", "dividend"):
            continue
        if t["amount"] >= 0:
            continue  # outflows only
        m = t.get("merchant_canonical")
        if not m:
            continue
        by_merchant.setdefault(m.lower(), []).append(t)

    subs = []
    today = datetime.date.today()
    for merchant_key, items in by_merchant.items():
        if len(items) < 2:
            continue
        # Sort by date
        items.sort(key=lambda t: t["date_posted"])
        dates = [datetime.date.fromisoformat(t["date_posted"]) for t in items]
        amounts = [abs(t["amount"]) for t in items]
        # Compute gaps in days
        gaps = [(dates[i+1] - dates[i]).days for i in range(len(dates)-1)]
        if not gaps:
            continue
        avg_gap = sum(gaps) / len(gaps)
        # Classify cadence
        cadence = None
        if all(28 <= g <= 32 for g in gaps[-3:]) or (25 <= avg_gap <= 35):
            cadence = "monthly"
        elif all(88 <= g <= 95 for g in gaps) or (85 <= avg_gap <= 100):
            cadence = "quarterly"
        elif all(350 <= g <= 380 for g in gaps) or (340 <= avg_gap <= 380):
            cadence = "annual"
        if not cadence:
            continue
        # Amount drift check
        sorted_amounts = sorted(amounts)
        median = sorted_amounts[len(sorted_amounts) // 2]
        if median <= 0:
            continue
        drifts = [abs(a - median) / median for a in amounts]
        if max(drifts) > 0.5:
            continue
        # OK, this is a subscription
        merchant_canonical = items[0]["merchant_canonical"]
        # Pick the dominant card
        card_counts: dict[str, int] = {}
        for t in items:
            card_counts[t["account_id"]] = card_counts.get(t["account_id"], 0) + 1
        primary_card = max(card_counts, key=card_counts.get)
        # Trailing-12mo charge count
        cutoff = today - datetime.timedelta(days=365)
        last_12_count = sum(1 for d in dates if d >= cutoff)
        # Status: active if last seen within 1.5x cadence
        cadence_days = {"monthly": 30, "quarterly": 90, "annual": 365}[cadence]
        days_since_last = (today - dates[-1]).days
        status = "active" if days_since_last <= cadence_days * 1.5 else "inactive"
        # Price-change detection
        price_change = None
        if amounts[-1] > median * 1.10:
            price_change = {"date": items[-1]["date_posted"], "delta_pct": round((amounts[-1] - median) / median * 100, 1)}
        # Suggestion tags
        tags = []
        if price_change:
            tags.append("recent_price_increase")
        # Annual cost
        annual_cost = amounts[-1] * (12 if cadence == "monthly" else 4 if cadence == "quarterly" else 1)
        monthly_cost = annual_cost / 12
        sub = {
            "id": _safe_sub_id(merchant_canonical),
            "merchant_canonical": merchant_canonical,
            "category": items[-1].get("category"),
            "cadence": cadence,
            "median_amount": round(median, 2),
            "current_amount": round(amounts[-1], 2),
            "first_seen": dates[0].isoformat(),
            "last_seen": dates[-1].isoformat(),
            "charge_count": len(items),
            "charge_count_12mo": last_12_count,
            "monthly_cost": round(monthly_cost, 2),
            "annual_cost": round(annual_cost, 2),
            "last_price_change": price_change,
            "primary_card_id": primary_card,
            "card_counts": card_counts,
            "txn_ids": [t["id"] for t in items],
            "suggestion_tags": tags,
            "suggestion_reason": _build_suggestion_reason(tags, price_change),
            "status": status,
        }
        subs.append(sub)

    # Cancellation overlaps - detect 2+ services in same category
    cat_counts: dict[str, list] = {}
    for s in subs:
        if s.get("category"):
            cat_counts.setdefault(s["category"], []).append(s)
    overlap_cats = {"streaming", "music", "cloud_storage", "news", "software", "ai_tools"}
    for cat, group in cat_counts.items():
        if cat in overlap_cats and len(group) >= 2:
            for s in group:
                tag = f"overlap_{cat}"
                if tag not in s["suggestion_tags"]:
                    s["suggestion_tags"].append(tag)
            for s in group:
                s["suggestion_reason"] = _build_suggestion_reason(s["suggestion_tags"], s.get("last_price_change"))

    # LLM classifier — filter false positives (gas/groceries/dining at the
    # same merchant fitting a monthly cadence by accident).
    subs = _llm_filter_subscriptions(subs)

    # User overrides — persisted in personal/subscription_overrides.yaml.
    subs = _apply_subscription_overrides(subs, db_path)

    save_json_atomic(db_path / "subscriptions.json", subs)
    return len(subs)


def _llm_filter_subscriptions(candidates: list[dict]) -> list[dict]:
    """Ask Claude to classify each candidate as is_subscription:bool.
    True subscriptions: recurring fixed-fee SERVICES (Netflix, gym, software,
    cloud storage, news, insurance premium auto-pay, mobile plan).
    False positives: recurring PURCHASES at the same place that just happen
    to land at a monthly cadence (gas, groceries, dining, parking, transit).
    """
    if not candidates:
        return candidates
    if not shutil.which("claude"):
        print("  (claude CLI not in PATH; skipping subscription LLM classifier)")
        return candidates

    # Build a compact summary the LLM can reason over.
    rows = []
    for s in candidates:
        rows.append({
            "merchant": s["merchant_canonical"],
            "category": s.get("category"),
            "cadence": s["cadence"],
            "median_amount": s["median_amount"],
            "charge_count": s["charge_count"],
            "first_seen": s["first_seen"],
            "last_seen": s["last_seen"],
        })

    system = (
        "You are a subscription classifier. Given a list of recurring-charge candidates, "
        "decide whether each is a true SUBSCRIPTION (recurring fixed-fee service) or a "
        "FALSE POSITIVE (a regular purchase pattern that just happens to fit a monthly "
        "cadence). Output ONLY a JSON array, one entry per input merchant, in input order:\n"
        '[{"merchant": "...", "is_subscription": true|false, "confidence": 0.0-1.0, "reason": "<short>"}]\n'
        "True subscriptions: streaming services, music services, software/SaaS, "
        "cloud storage, news, gym/fitness, dating apps, insurance premium auto-pay, "
        "phone/internet/utility service plans, AI tools, donation pledges, storage "
        "units, magazine/newspaper, audiobooks, brokerage premium tiers, professional "
        "dues. False positives: gas stations, grocery stores, restaurants/bars, "
        "parking, public transit fares, rideshare, drugstores, big-box retail, ATM "
        "withdrawals, online marketplaces (ad-hoc orders), coffee shops, hardware "
        "stores. When in doubt: if a HUMAN would describe it as 'a subscription I "
        "pay for', say true; if they'd say 'I shop there sometimes', say false."
    )
    user_msg = "Classify these recurring-charge candidates:\n\n" + json.dumps(rows, indent=2)

    cmd = [
        "claude", "-p", user_msg,
        "--system-prompt", system,
        "--output-format", "json",
        "--model", "opus",
        "--allowedTools", "",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        print("  (subscription classifier LLM call timed out; keeping heuristic output)")
        return candidates
    if result.returncode != 0:
        print(f"  (subscription classifier failed: {result.stderr.strip()[:200]}; keeping heuristic output)")
        return candidates

    try:
        wrapper = json.loads(result.stdout)
        text = (wrapper.get("result") or "").strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```\s*$", "", text)
        decisions = json.loads(text)
    except (json.JSONDecodeError, ValueError) as e:
        print(f"  (subscription classifier JSON parse failed: {e}; keeping heuristic output)")
        return candidates

    if not isinstance(decisions, list):
        return candidates

    # Build merchant -> decision map; lowercase for tolerant matching.
    decision_by_merchant = {}
    for d in decisions:
        m = (d.get("merchant") or "").strip().lower()
        if m:
            decision_by_merchant[m] = d

    kept = []
    dropped = []
    for s in candidates:
        d = decision_by_merchant.get(s["merchant_canonical"].strip().lower())
        if d and d.get("is_subscription") is False and (d.get("confidence") or 0) >= 0.5:
            dropped.append(s["merchant_canonical"])
            continue
        kept.append(s)

    if dropped:
        print(f"  Subscription LLM filter dropped {len(dropped)} false positive(s): {', '.join(dropped[:6])}{'...' if len(dropped) > 6 else ''}")
    return kept


def _apply_subscription_overrides(subs: list[dict], db_path: Path) -> list[dict]:
    """User overrides stored in personal/subscription_overrides.yaml.

    Format:
      overrides:
        - merchant: "<merchant name>"
          action: dismiss   # never classify as subscription
        - merchant: "<merchant name>"
          action: include   # always include even if heuristic missed
    """
    cfg_path = (db_path.parent / "personal" / "subscription_overrides.yaml")
    if not cfg_path.exists():
        return subs
    try:
        cfg = yaml.safe_load(cfg_path.read_text()) or {}
    except Exception as e:
        print(f"  (subscription_overrides.yaml parse failed: {e}; skipping)")
        return subs

    overrides = cfg.get("overrides") or []
    dismiss_set = {(o.get("merchant") or "").strip().lower() for o in overrides if o.get("action") == "dismiss"}
    include_entries = [o for o in overrides if o.get("action") == "include"]

    # Drop dismissed
    out = [s for s in subs if s["merchant_canonical"].strip().lower() not in dismiss_set]

    # Add manual includes that aren't already present (build a stub from transactions)
    txns_by_merchant = {}
    txns = load_json(db_path / "transactions.json", [])
    for t in txns:
        m = (t.get("merchant_canonical") or "").strip().lower()
        if m:
            txns_by_merchant.setdefault(m, []).append(t)

    existing_keys = {s["merchant_canonical"].strip().lower() for s in out}
    for entry in include_entries:
        merchant = (entry.get("merchant") or "").strip()
        if not merchant or merchant.lower() in existing_keys:
            continue
        items = txns_by_merchant.get(merchant.lower()) or []
        items.sort(key=lambda t: t["date_posted"])
        if not items:
            print(f"  (subscription override 'include' for '{merchant}' has no matching transactions yet)")
            continue
        amounts = [abs(t["amount"]) for t in items if t["amount"] < 0]
        if not amounts:
            continue
        median = sorted(amounts)[len(amounts) // 2]
        cadence = entry.get("cadence", "monthly")
        annual = median * (12 if cadence == "monthly" else 4 if cadence == "quarterly" else 1)
        card_counts: dict = {}
        for t in items:
            card_counts[t["account_id"]] = card_counts.get(t["account_id"], 0) + 1
        out.append({
            "id": f"{_safe_sub_id(merchant)}_user",
            "merchant_canonical": merchant,
            "category": items[-1].get("category"),
            "cadence": cadence,
            "median_amount": round(median, 2),
            "current_amount": round(amounts[-1], 2),
            "first_seen": items[0]["date_posted"],
            "last_seen": items[-1]["date_posted"],
            "charge_count": len(items),
            "charge_count_12mo": len(items),
            "monthly_cost": round(annual / 12, 2),
            "annual_cost": round(annual, 2),
            "last_price_change": None,
            "primary_card_id": max(card_counts, key=card_counts.get),
            "card_counts": card_counts,
            "txn_ids": [t["id"] for t in items],
            "suggestion_tags": [],
            "suggestion_reason": "Manually marked as subscription.",
            "status": "active",
            "user_added": True,
        })

    return out


def _build_suggestion_reason(tags: list, price_change) -> str:
    if not tags:
        return ""
    parts = []
    if "recent_price_increase" in tags and price_change:
        parts.append(f"Price up {price_change['delta_pct']:.0f}% since previous charge")
    overlap_tags = [t for t in tags if t.startswith("overlap_")]
    if overlap_tags:
        parts.append(f"You have multiple services in: {', '.join(t.replace('overlap_', '') for t in overlap_tags)}")
    return ". ".join(parts)


def auto_categorize(db_path: Path) -> dict:
    """LLM categorize any uncategorized transactions. Single batched Claude call.

    Returns {"categorized": N, "new_categories": [ids]}.
    """
    txns = load_json(db_path / "transactions.json", [])
    cats = load_json(db_path / "categories.json", [])
    uncategorized = [t for t in txns if not t.get("category") and t.get("type") != "transfer"]
    if not uncategorized:
        return {"categorized": 0, "new_categories": []}

    if not shutil.which("claude"):
        print(f"  (claude CLI not in PATH; skipping auto-categorize)")
        return {"categorized": 0, "new_categories": []}

    cats_summary = [
        {"id": c["id"], "name": c["name"], "parent": c.get("parent"), "aliases": c.get("aliases", [])}
        for c in cats
    ]
    txn_summary = [
        {
            "id": t["id"],
            "merchant": t.get("merchant_canonical"),
            "desc": (t.get("description_normalized") or "")[:80],
            "amount": t["amount"],
            "type": t.get("type"),
        }
        for t in uncategorized
    ]

    user_msg = (
        f"Existing categories: {json.dumps(cats_summary, indent=0)}\n\n"
        f"Uncategorized transactions: {json.dumps(txn_summary, indent=0)}\n\n"
        "Map every transaction to its best-fit existing category. If you encounter a clearly "
        "novel category (no good fit and no near-duplicate among existing), propose ONE new "
        "category in `new_categories`. ALWAYS check for similar existing categories first - "
        "we do NOT want near-duplicates (e.g. don't create 'Coffee Shops' when 'coffee' exists). "
        "Output ONLY this JSON:\n"
        '{"results": [{"txn_id": "...", "category_id": "...", "confidence": 0.0-1.0}], '
        '"new_categories": [{"id": "slug", "name": "Display", "parent": "existing_parent_or_null"}]}'
    )

    cmd = ["claude", "-p", user_msg, "--output-format", "json",
           "--system-prompt", "You categorize financial transactions against a controlled vocabulary. Output strict JSON.",
           "--model", "opus", "--allowedTools", ""]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        print(f"  (auto-categorize timed out after 5min)")
        return {"categorized": 0, "new_categories": []}
    if result.returncode != 0:
        print(f"  (auto-categorize CLI failed: {result.stderr[:200]})")
        return {"categorized": 0, "new_categories": []}

    try:
        wrapper = json.loads(result.stdout)
        text = wrapper.get("result", "").strip()
        if text.startswith("```"):
            m = re.match(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.S)
            if m: text = m.group(1).strip()
        data = json.loads(text)
    except (json.JSONDecodeError, KeyError) as e:
        print(f"  (auto-categorize: malformed output: {e})")
        return {"categorized": 0, "new_categories": []}

    # Add new categories (with similarity check vs existing)
    cat_ids = {c["id"] for c in cats}
    new_cat_ids = []
    now = datetime.datetime.utcnow().isoformat() + "Z"
    for nc in data.get("new_categories", []) or []:
        if not nc.get("id") or nc["id"] in cat_ids:
            continue
        # Cheap fuzzy: skip if any existing category name is substring or vice versa
        nc_name = (nc.get("name") or nc["id"]).lower()
        too_similar = False
        for c in cats:
            cn = (c.get("name") or c["id"]).lower()
            if cn == nc_name or (len(cn) > 4 and len(nc_name) > 4 and (cn in nc_name or nc_name in cn)):
                too_similar = True
                break
        if too_similar:
            continue
        cats.append({
            "id": nc["id"],
            "name": nc.get("name") or nc["id"],
            "parent": nc.get("parent"),
            "aliases": nc.get("aliases", []),
            "created_by": "ai",
            "created_at": now,
            "frozen": False,
            "example_merchants": [],
        })
        cat_ids.add(nc["id"])
        new_cat_ids.append(nc["id"])

    # Apply categorizations
    by_id = {t["id"]: t for t in txns}
    applied = 0
    for r in data.get("results", []) or []:
        t = by_id.get(r.get("txn_id"))
        if not t or t.get("category"):
            continue
        cid = r.get("category_id")
        if cid not in cat_ids:
            continue
        conf = float(r.get("confidence", 0.7))
        if conf < 0.5:
            continue
        t["category"] = cid
        t["category_confidence"] = conf
        t["categorized_by"] = "ai"
        applied += 1

    if applied or new_cat_ids:
        save_json_atomic(db_path / "transactions.json", txns)
        save_json_atomic(db_path / "categories.json", cats)
    return {"categorized": applied, "new_categories": new_cat_ids}


def match_amazon_orders(db_path: Path) -> int:
    """Match Amazon orders to credit-card transactions by amount + date proximity.
    Side-effects: order.matched_txn_id, txn.order_id. Returns count of new matches."""
    orders = load_json(db_path / "orders.json", [])
    txns = load_json(db_path / "transactions.json", [])
    if not orders:
        return 0

    amzn_re = re.compile(r"AMZN|AMAZON", re.I)
    candidates = [
        t for t in txns
        if (t.get("merchant_canonical") or "").lower().find("amazon") >= 0
        or amzn_re.search(t.get("description_normalized") or "")
    ]
    matched = 0
    for order in orders:
        if order.get("matched_txn_id"):
            continue
        total = order.get("total")
        date = order.get("date_placed")
        if total is None or not date:
            continue
        order_dt = datetime.date.fromisoformat(date)
        best = None
        best_days = 999
        for t in candidates:
            if t.get("order_id"):
                continue
            if abs(abs(t["amount"]) - total) > 0.01:
                continue
            try:
                t_dt = datetime.date.fromisoformat(t["date_posted"])
            except Exception:
                continue
            days = abs((t_dt - order_dt).days)
            if days > 7:
                continue
            if days < best_days:
                best = t
                best_days = days
        if best:
            order["matched_txn_id"] = best["id"]
            best["order_id"] = order["order_id"]
            matched += 1
    if matched:
        save_json_atomic(db_path / "orders.json", orders)
        save_json_atomic(db_path / "transactions.json", txns)
    return matched


def commit_data_changes(data_root: Path, message: str) -> None:
    """Stage everything in the data dir and commit if there are changes.
    Local-only repo; never pushes. Silent if .git is missing."""
    if not (data_root / ".git").exists():
        return
    try:
        subprocess.run(["git", "-C", str(data_root), "add", "-A"], check=True, capture_output=True)
        # Only commit if something is actually staged.
        diff = subprocess.run(
            ["git", "-C", str(data_root), "diff", "--cached", "--quiet"],
            capture_output=True,
        )
        if diff.returncode != 0:
            subprocess.run(
                ["git", "-C", str(data_root),
                 "-c", "user.email=local@myfainance",
                 "-c", "user.name=MyfAInance Local",
                 "commit", "-m", message],
                check=True, capture_output=True,
            )
    except Exception as e:
        print(f"  (git commit skipped: {e})")


def extract_text(file_path: Path) -> list[str]:
    suffix = file_path.suffix.lower()
    if suffix == ".csv":
        return [file_path.read_text(encoding="utf-8", errors="replace")]
    if suffix in (".html", ".htm"):
        return [_extract_html_text(file_path)]
    if suffix in (".txt", ".tsv"):
        return [file_path.read_text(encoding="utf-8", errors="replace")]
    r = pypdf.PdfReader(str(file_path))
    return [p.extract_text() for p in r.pages]


def _extract_html_text(file_path: Path) -> str:
    """Strip tags + collapse whitespace. We don't need full DOM fidelity — the
    LLM extractor reads the text content and the structural cues (table rows
    rendered with newlines) survive a naive strip."""
    raw = file_path.read_text(encoding="utf-8", errors="replace")
    # Drop scripts and styles wholesale (Fidelity's HTML drops in giant inline JS).
    raw = re.sub(r"<script\b[^>]*>.*?</script>", " ", raw, flags=re.DOTALL | re.IGNORECASE)
    raw = re.sub(r"<style\b[^>]*>.*?</style>", " ", raw, flags=re.DOTALL | re.IGNORECASE)
    # Replace block-level elements with newlines so tabular content remains separable.
    raw = re.sub(r"</(tr|li|p|div|h[1-6]|td|th|br|section|article|hr)>", "\n", raw, flags=re.IGNORECASE)
    raw = re.sub(r"<br\s*/?>", "\n", raw, flags=re.IGNORECASE)
    # Strip remaining tags.
    raw = re.sub(r"<[^>]+>", " ", raw)
    # HTML entities.
    raw = html.unescape(raw)
    # Collapse whitespace.
    raw = re.sub(r"[ \t]+", " ", raw)
    raw = re.sub(r"\n[ \t]*\n+", "\n\n", raw)
    return raw.strip()


def _organize_in_inbox(src: Path, inbox: Path, parsed_statements: list[dict]) -> Path | None:
    """Move/rename a processed file into inbox/<institution>/<YYYY-MM>.<ext>.

    Returns the new path, or None if no statements parsed (file is left alone).
    No-op if the file is already at its canonical location.
    """
    if not parsed_statements:
        return None
    institution = parsed_statements[0]["institution"]
    period_yyyymm = parsed_statements[0]["period_end"][:7]
    ext = src.suffix.lower()
    target_dir = inbox / institution
    target_dir.mkdir(parents=True, exist_ok=True)

    target = target_dir / f"{period_yyyymm}{ext}"
    # Avoid clobbering a different file at the same canonical path.
    if target.exists() and target.resolve() != src.resolve():
        n = 2
        while True:
            candidate = target_dir / f"{period_yyyymm}-{n}{ext}"
            if not candidate.exists():
                target = candidate
                break
            n += 1

    if target.resolve() == src.resolve():
        return src  # already in canonical location
    shutil.move(str(src), str(target))
    return target


def research_card_benefits_for_new(personal_path: Path) -> None:
    """When a freshly-ingested statement adds a new credit-card account
    that doesn't yet have a benefits block, fetch perks/rewards from the
    web via the Claude CLI. Cached 30 days so re-ingests are no-ops.
    Failures here are non-fatal: the dashboard works without benefits."""
    accounts_file = personal_path / "accounts.yaml"
    if not accounts_file.exists():
        return
    try:
        data = yaml.safe_load(accounts_file.read_text()) or {}
    except yaml.YAMLError as e:
        print(f"  (skip card-benefits research: accounts.yaml parse failed — {e})")
        return
    pending = [
        a for a in (data.get("accounts") or [])
        if a.get("type") == "credit_card" and not a.get("benefits")
    ]
    if not pending:
        return
    print(f"Card-benefits research: {len(pending)} new card(s) to look up...")
    try:
        # Lazy import — research_card_benefits depends on PyYAML and urllib only,
        # and we only want to pull it in when needed.
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import research_card_benefits  # type: ignore
        result = research_card_benefits.research_all_cards(personal_path, force=False)
        researched = result.get("researched", 0)
        if researched:
            print(f"Card-benefits research: populated benefits for {researched} card(s)")
        else:
            print("Card-benefits research: no cards required new lookups (cache hit)")
    except Exception as e:
        print(f"  (card-benefits research failed: {e})")


def seed_categories_if_empty(db_path: Path, repo_root: Path, personal_path: Path) -> None:
    """Initialize categories.json from skill defaults + personal overrides on first run."""
    cat_file = db_path / "categories.json"
    existing = load_json(cat_file, [])
    if existing:
        return  # already seeded

    defaults = load_yaml(repo_root / "skill/categorization/default-categories.yaml")
    personal = load_yaml(personal_path / "categories.yaml")

    by_id = {}
    now = datetime.datetime.utcnow().isoformat() + "Z"
    for entry in defaults.get("categories", []):
        cat = {
            "id": entry["id"],
            "name": entry["name"],
            "parent": entry.get("parent"),
            "aliases": entry.get("aliases", []),
            "created_by": "seed",
            "created_at": now,
            "frozen": entry.get("frozen", False),
            "example_merchants": [],
        }
        by_id[cat["id"]] = cat

    for entry in personal.get("categories", []):
        if entry["id"] in by_id:
            for k in ("name", "parent", "aliases", "frozen"):
                if k in entry:
                    by_id[entry["id"]][k] = entry[k]
            by_id[entry["id"]]["created_by"] = "user"
        else:
            by_id[entry["id"]] = {
                "id": entry["id"],
                "name": entry.get("name", entry["id"]),
                "parent": entry.get("parent"),
                "aliases": entry.get("aliases", []),
                "created_by": "user",
                "created_at": now,
                "frozen": entry.get("frozen", False),
                "example_merchants": [],
            }

    save_json_atomic(cat_file, list(by_id.values()))
    print(f"Seeded categories.json with {len(by_id)} categories.")


# Parser selection is trivial now: the LLM parser handles every institution.
# Kept as a function so the orchestrator's call site stays clear.
def pick_parser(pages_text: list[str]):
    return SimpleNamespace(parse=llm_parse, anomaly_reason=anomaly_reason), "_llm"


def process_file(pdf_path: Path, cfg: dict, accounts: dict, rules: list[dict], aliases_cfg: dict, alerts_cfg: dict) -> dict:
    db_path = Path(cfg["db_path"])
    archive_path = Path(cfg["archive_path"])

    print(f"\nProcessing: {pdf_path.name}")
    file_hash = sha256_file(pdf_path)

    processed = load_json(db_path / "processed.json", {})
    if file_hash in processed:
        # Already ingested somewhere. If this copy is at the inbox root (not yet
        # organized) and the canonical organized copy still exists, delete this one.
        inbox = Path(cfg["inbox_path"])
        if pdf_path.parent == inbox:
            # Look for an existing organized file with the same hash.
            for other in inbox.rglob("*"):
                if other.is_file() and other != pdf_path and other.parent != inbox:
                    if sha256_file(other) == file_hash:
                        pdf_path.unlink()
                        print(f"  Duplicate of {other.relative_to(inbox)}. Removed root-level copy.")
                        return {"status": "skipped_dup_removed"}
        print(f"  Duplicate file (hash already in processed.json). Skipping.")
        return {"status": "skipped_dup_file"}

    pages_text = extract_text(pdf_path)
    parser, institution = pick_parser(pages_text)
    print(f"  Parser: {institution}")

    try:
        parsed = parser.parse(
            pages_text,
            accounts=accounts,
            personal_path=Path(cfg["personal_path"]),
            filename=pdf_path.name,
            repo_root=Path(cfg["repo_root"]),
        )
    except (RuntimeError, NotImplementedError) as e:
        print(f"  ERROR: {e}")
        return {"status": "parser_error", "error": str(e)}

    # Orders envelope (Amazon "Your Orders" exports etc.) - separate code path.
    if parsed.get("envelope_type") == "orders":
        return _process_orders(pdf_path, file_hash, cfg, parsed, processed)

    parsed_statements = parsed["statements"]
    parsed_txns = parsed["transactions"]
    print(f"  Found {len(parsed_statements)} statement(s) in this file")

    statements_db = load_json(db_path / "statements.json", [])
    txn_db = load_json(db_path / "transactions.json", [])
    merchants = load_json(db_path / "merchants.json", [])
    anomalies = load_json(db_path / "anomalies.json", [])
    merchants_by_name = {m["canonical_name"]: m for m in merchants}

    now = datetime.datetime.utcnow().isoformat() + "Z"
    inserted_statements = 0
    inserted_txns = 0
    inserted_flags = 0

    for idx, statement in enumerate(parsed_statements):
        # Layer 2 dedup
        stmt_key = (statement["institution"], statement["account_id"], statement["period_start"], statement["period_end"])
        if any((s["institution"], s["account_id"], s["period_start"], s["period_end"]) == stmt_key for s in statements_db):
            print(f"  [{statement['account_id']}] Duplicate statement - skipping")
            continue

        # Finalize this statement's transactions
        raw_for_stmt = [t for t in parsed_txns if t.get("_statement_idx", 0) == idx]
        for t in raw_for_stmt:
            t.pop("_statement_idx", None)

        is_first_ever = (len(txn_db) == 0)
        finalized = finalize_transactions(
            raw_for_stmt,
            statement_id=statement["id"],
            rules=rules,
            aliases_cfg=aliases_cfg,
            cfg=cfg,
            alerts_cfg=alerts_cfg,
            is_first_ever=is_first_ever,
        )

        # Layer 3 dedup
        existing_keys = {(t["account_id"], t["date_posted"], t["amount"], t["description_normalized"][:40]) for t in txn_db}
        new_txns = []
        for t in finalized:
            key = (t["account_id"], t["date_posted"], t["amount"], t["description_normalized"][:40])
            if key in existing_keys:
                continue
            new_txns.append(t)
            existing_keys.add(key)

        # Tag file metadata
        statement["source_file_hash"] = file_hash
        statement["source_filename"] = pdf_path.name
        statement["ingested_at"] = now
        for t in new_txns:
            t["source_file_hash"] = file_hash
            t["ingested_at"] = now

        # Persist statement + transactions
        statements_db.append(statement)
        txn_db.extend(new_txns)

        # Merchants registry
        for t in new_txns:
            name = t.get("merchant_canonical")
            if not name:
                continue
            m = merchants_by_name.get(name)
            if not m:
                m = {
                    "canonical_name": name,
                    "raw_descriptions": [],
                    "categories_seen": {},
                    "first_seen": t["date_posted"],
                    "last_seen": t["date_posted"],
                    "charge_count": 0,
                }
                merchants_by_name[name] = m
            if t["description_raw"] not in m["raw_descriptions"]:
                m["raw_descriptions"].append(t["description_raw"])
            if t.get("category"):
                m["categories_seen"][t["category"]] = m["categories_seen"].get(t["category"], 0) + 1
            m["first_seen"] = min(m["first_seen"], t["date_posted"])
            m["last_seen"] = max(m["last_seen"], t["date_posted"])
            m["charge_count"] += 1

        # Anomaly events
        for t in new_txns:
            for flag in t.get("anomaly_flags", []):
                anomalies.append({
                    "id": f"anom_{t['id']}_{flag}",
                    "txn_id": t["id"],
                    "flag": flag,
                    "amount": t["amount"],
                    "merchant": t.get("merchant_canonical"),
                    "reason": parser.anomaly_reason(flag, t),
                    "confidence": 1.0 if flag in {"fee", "foreign", "large_txn", "round_number_large"} else 0.85,
                    "surfaced_at": now,
                    "reviewed_by_user": False,
                    "user_action": None,
                })
                inserted_flags += 1

        inserted_statements += 1
        inserted_txns += len(new_txns)
        print(f"  [{statement['account_id']}] {len(new_txns)} new txns")

    # Persist all DB files atomically (one write each).
    save_json_atomic(db_path / "statements.json", statements_db)
    save_json_atomic(db_path / "transactions.json", txn_db)
    save_json_atomic(db_path / "merchants.json", list(merchants_by_name.values()))
    save_json_atomic(db_path / "anomalies.json", anomalies)

    # New categories from parser
    for new_cat in parsed.get("new_categories", []):
        cats = load_json(db_path / "categories.json", [])
        if not any(c["id"] == new_cat["id"] for c in cats):
            new_cat["created_at"] = now
            new_cat.setdefault("created_by", "ai")
            new_cat.setdefault("aliases", [])
            new_cat.setdefault("frozen", False)
            new_cat.setdefault("example_merchants", [])
            cats.append(new_cat)
            save_json_atomic(db_path / "categories.json", cats)

    # processed.json
    processed[file_hash] = {
        "statement_ids": [s["id"] for s in parsed_statements],
        "filename": pdf_path.name,
        "ingested_at": now,
    }
    save_json_atomic(db_path / "processed.json", processed)

    # Files stay in the inbox after ingest, but get organized into
    # inbox/<institution>/<YYYY-MM>.pdf for consistency. processed.json (file hash)
    # prevents re-ingestion on subsequent runs.
    inbox = Path(cfg["inbox_path"])
    canonical = _organize_in_inbox(pdf_path, inbox, parsed_statements)
    if canonical and canonical != pdf_path:
        rel = canonical.relative_to(inbox)
        print(f"  Stored at: inbox/{rel}")
    print(f"  Inserted: {inserted_statements} statement(s), {inserted_txns} transactions, {inserted_flags} anomaly flags.")

    return {"status": "ingested", "statements": parsed_statements, "transactions_count": inserted_txns}


def main(argv: list[str]) -> int:
    cfg = load_config()
    inbox = Path(cfg["inbox_path"])
    db_path = Path(cfg["db_path"])
    personal_path = Path(cfg["personal_path"])
    repo_root = Path(cfg["repo_root"])

    seed_categories_if_empty(db_path, repo_root, personal_path)

    accounts = load_yaml(personal_path / "accounts.yaml")
    aliases_cfg = load_yaml(personal_path / "aliases.yaml")
    alerts_cfg = load_yaml(personal_path / "alerts.yaml")
    rules = load_rules(repo_root, personal_path)

    if len(argv) > 1:
        files = [Path(argv[1])]
    else:
        # Walk inbox recursively so files in inbox/<institution>/<period>.{pdf,csv,html} are picked up.
        files = sorted(
            p for p in inbox.rglob("*")
            if p.is_file()
            and p.suffix.lower() in (".pdf", ".csv", ".html", ".htm")
            # Skip HTML asset files saved alongside the main page (e.g. Statements_files/main.js).
            and "_files" not in p.parts
        )

    if not files:
        print("Inbox is empty.")
        return 0

    # TODO: parallelize extraction phase (LLM calls) safely once process_file is
    # split into extract-only (parallel-safe) + persist (lock-guarded). For now
    # sequential to avoid races on shared JSON files and accounts.yaml.
    results = []
    for f in files:
        try:
            results.append(process_file(f, cfg, accounts, rules, aliases_cfg, alerts_cfg))
        except Exception as e:
            import traceback
            print(f"  ERROR processing {f.name}: {e}")
            traceback.print_exc()
            results.append({"status": "error", "file": f.name, "error": str(e)})

    # After all files: auto-categorize, match orders, regenerate reports, commit.
    ingested = sum(1 for r in results if r.get("status") == "ingested")
    if ingested > 0:
        # 1. Auto-categorize uncategorized transactions via Claude.
        cat_result = auto_categorize(db_path)
        if cat_result["categorized"] > 0 or cat_result["new_categories"]:
            print(f"\nAuto-categorize: {cat_result['categorized']} transactions, {len(cat_result['new_categories'])} new categories")

        # 1.5. Clean up merchant names (strip ACH/POS/processor prefixes, trim phone numbers).
        cleaned = clean_merchants(db_path)
        if cleaned > 0:
            print(f"Merchant cleanup: normalized {cleaned} merchants")

        # 1.7. Enrich metadata (city, state, payment method) for existing rows missing it.
        enriched = enrich_metadata(db_path)
        if enriched > 0:
            print(f"Metadata enrichment: {enriched} fields populated")

        # 2. Match Amazon orders to credit-card transactions.
        matched = match_amazon_orders(db_path)
        if matched > 0:
            print(f"Order matcher: linked {matched} Amazon orders to transactions")

        # 2.5. Detect subscriptions across all transactions.
        sub_count = detect_subscriptions(db_path)
        print(f"Subscription detection: {sub_count} recurring patterns")

        # 2.6. Research card perks/benefits for any credit-card account that
        # doesn't yet have a benefits block (or whose research is stale).
        # Skipped silently if no credit cards qualify.
        research_card_benefits_for_new(personal_path)

        # 3. Regenerate reports.
        try:
            subprocess.run(
                [sys.executable, str(REPO_ROOT / "scripts" / "report.py")],
                check=True, capture_output=True,
            )
        except subprocess.CalledProcessError as e:
            print(f"  (report.py failed: {e.stderr.decode()[:200]})")

        # 4. Commit.
        data_root = Path(cfg["data_root"]) if cfg.get("data_root") else Path(cfg["personal_path"]).parent
        total_txns = sum(r.get("transactions_count", 0) for r in results)
        commit_data_changes(data_root, f"Ingest: {ingested} statement(s), {total_txns} transactions")

    print()
    print("Summary:")
    counts = {}
    for r in results:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    for k, v in counts.items():
        print(f"  {k}: {v}")
    print()
    print(f"Run scripts/report.py to generate the period report.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
