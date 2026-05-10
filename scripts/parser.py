"""LLM-native statement parser. Calls the Claude CLI in headless mode (no API key).

Uses your local Claude subscription (OAuth/keychain). One Python entrypoint
handles every institution; institution-specific behavior is reasoned about
by the model from the prompt + the user's accounts list.

Returns the standard envelope:
    {"statement": dict, "transactions": [dict], "new_categories": []}
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from typing import Any


INSTITUTION = "_llm"


_SYSTEM_PROMPT = """You are a financial-statement extractor. Given the full text of a bank, credit-card, savings, brokerage, or loan statement (extracted from a PDF), return a SINGLE JSON object matching the schema below. Output ONLY the JSON. No prose, no markdown fences, no preamble.

A single statement file may cover MULTIPLE accounts (e.g. a credit-union statement that lists savings and checking together). In that case, return a "statements" array with one entry per account, and a "transactions" array containing every transaction across them (each transaction tagged with the account it belongs to).

OUTPUT SHAPE:

{
  "statements": [
    {
      "institution": "<lowercase snake_case slug; e.g. capital_one, chase, dcu, amex>",
      "account_last4": "<4 digits or null if not printed>",
      "account_subname": "<short product name from the statement (e.g. 'Free Checking', 'Primary Savings', 'Travel Rewards Card')>",
      "account_type": "checking | savings | credit_card | brokerage | loan | mortgage | hsa | 401k | ira | roth_ira | 403b | sep_ira | utility | toll | insurance | tax_document | other",
      "period_start": "<YYYY-MM-DD>",
      "period_end": "<YYYY-MM-DD>",
      "issue_date": "<YYYY-MM-DD or null>",
      "beginning_balance": <number or null>,
      "ending_balance": <number or null>,
      "currency": "<ISO 4217; default USD>",
      "credit_card": {
        "credit_limit": <number or null>,
        "available_credit": <number or null>,
        "min_payment_due": <number or null>,
        "payment_due_date": "<YYYY-MM-DD or null>",
        "apr_purchases": <number or null>,
        "apr_cash": <number or null>,
        "apr_balance_transfer": <number or null>,
        "rewards_balance": <integer or null>,
        "rewards_earned": <integer or null>,
        "rewards_redeemed": <integer or null>,
        "interest_charge_purchases": <number or null>,
        "interest_charge_cash": <number or null>
      } or null,
      "brokerage": {
        "as_of_date": "<YYYY-MM-DD or null>",
        "portfolio_value": <number or null>,
        "cost_basis": <number or null>,
        "unrealized_gain": <number or null>,
        "cash_balance": <number or null>,
        "dividends_period": <number or null>,
        "dividends_ytd": <number or null>,
        "fees_period": <number or null>,
        "holdings": [
          {"symbol": "<ticker>", "name": "<security name>", "shares": <number>, "price": <number>, "value": <number>, "cost_basis": <number or null>, "unrealized_gain": <number or null>, "asset_class": "<equity|fixed_income|cash|alt|null>"}
        ]
      } or null,
      "retirement": {
        "as_of_date": "<YYYY-MM-DD or null>",
        "subtype": "traditional_ira | roth_ira | 401k | 403b | sep_ira | hsa",
        "balance": <number or null>,
        "vested_balance": <number or null>,
        "ytd_contributions_employee": <number or null>,
        "ytd_contributions_employer": <number or null>,
        "ytd_contributions_total": <number or null>,
        "annual_contribution_limit": <number or null>,
        "ytd_distributions": <number or null>,
        "loan_balance": <number or null>,
        "vesting_schedule": "<string or null>",
        "plan_name": "<string or null>",
        "plan_sponsor": "<employer name or null>",
        "plan_id": "<string or null>",
        "rmd_required": <true | false | null>,
        "rmd_amount": <number or null>,
        "beneficiaries": [<strings>],
        "holdings": [
          {"symbol": "<ticker or null>", "name": "<fund name>", "shares": <number or null>, "price": <number or null>, "value": <number>, "allocation_pct": <number or null>}
        ]
      } or null,
      "loan": {
        "loan_type": "mortgage | auto | student | personal | heloc | other",
        "principal_balance": <number or null>,
        "original_principal": <number or null>,
        "interest_rate": <number or null>,
        "rate_type": "fixed | variable | null",
        "monthly_payment": <number or null>,
        "principal_paid_period": <number or null>,
        "interest_paid_period": <number or null>,
        "principal_paid_ytd": <number or null>,
        "interest_paid_ytd": <number or null>,
        "escrow_balance": <number or null>,
        "next_payment_date": "<YYYY-MM-DD or null>",
        "payoff_date": "<YYYY-MM-DD or null>",
        "remaining_term_months": <integer or null>
      } or null,
      "utility": {
        "service_type": "electric | gas | water | sewer | trash | internet | phone | tv | combined",
        "service_address": "<string or null>",
        "previous_balance": <number or null>,
        "payments_received": <number or null>,
        "current_charges": <number or null>,
        "amount_due": <number or null>,
        "due_date": "<YYYY-MM-DD or null>",
        "auto_pay_enrolled": <true | false | null>,
        "usage": {
          "electric_kwh": <number or null>,
          "electric_cost": <number or null>,
          "gas_therms": <number or null>,
          "gas_cost": <number or null>,
          "water_gallons": <number or null>,
          "water_cost": <number or null>,
          "average_daily_kwh": <number or null>,
          "average_daily_therms": <number or null>,
          "vs_prior_period_pct": <number or null>,
          "rate_plan": "<string or null>",
          "tier_breakdown": [<free-form>]
        }
      } or null,
      "toll": {
        "balance": <number or null>,
        "auto_replenish_threshold": <number or null>,
        "auto_replenish_amount": <number or null>,
        "tag_count": <integer or null>,
        "trips_period": <integer or null>,
        "tolls_period": <number or null>,
        "fees_period": <number or null>,
        "violations_count": <integer or null>,
        "violations_amount": <number or null>
      } or null,
      "insurance": {
        "policy_type": "term_life | whole_life | universal_life | health | auto | home | umbrella | disability | other",
        "policy_number": "<string or null>",
        "cash_value": <number or null>,
        "death_benefit": <number or null>,
        "premium_paid_period": <number or null>,
        "premium_paid_ytd": <number or null>,
        "next_premium_due": <number or null>,
        "next_premium_date": "<YYYY-MM-DD or null>"
      } or null,
      "tax_form": {
        "form_type": "1099-Composite | 1099-DIV | 1099-INT | 1099-B | 1099-MISC | 1099-NEC | W-2 | 1098 | other",
        "tax_year": <integer>,
        "issuer": "<broker/payer name>",
        "div_ordinary": <number or null>,
        "div_qualified": <number or null>,
        "div_capital_gain_distr": <number or null>,
        "div_section_199a": <number or null>,
        "div_nondividend": <number or null>,
        "div_foreign_tax_paid": <number or null>,
        "int_income": <number or null>,
        "int_us_treasury": <number or null>,
        "int_tax_exempt": <number or null>,
        "int_early_withdrawal_penalty": <number or null>,
        "b_total_proceeds": <number or null>,
        "b_total_cost_basis": <number or null>,
        "b_total_gain_loss": <number or null>,
        "b_short_term_proceeds": <number or null>,
        "b_short_term_basis": <number or null>,
        "b_short_term_gain": <number or null>,
        "b_long_term_proceeds": <number or null>,
        "b_long_term_basis": <number or null>,
        "b_long_term_gain": <number or null>,
        "misc_other_income": <number or null>,
        "misc_nonemployee_comp": <number or null>,
        "fed_tax_withheld": <number or null>,
        "state_tax_withheld": <number or null>,
        "summary_total_dividends": <number or null>,
        "summary_total_interest": <number or null>,
        "summary_total_realized_gain_loss": <number or null>,
        "summary_total_fees": <number or null>
      } or null
    }
  ],
  "transactions": [
    {
      "account_index": <0-based index into the statements array>,
      "date_posted": "<YYYY-MM-DD>",
      "date_transaction": "<YYYY-MM-DD>",
      "amount": <signed number, see SIGN CONVENTION>,
      "currency": "USD",
      "description_raw": "<verbatim from statement; preserve as-is>",
      "type": "debit | credit | fee | interest | transfer | check | dividend",
      "is_foreign": <true | false | null>,
      "fx_rate": <number or null>,
      "check_number": "<string or null>",
      "merchant_city": "<city if printed, else null>",
      "merchant_state": "<2-letter US state or country code, else null>",
      "merchant_country": "<country name if non-US, else null>",
      "merchant_phone": "<phone number if printed, else null>",
      "payment_method": "<ACH | POS | CheckCard | ATM | Wire | Online | Mobile | Recurring | null>",
      "transaction_time": "<HH:MM (24h) if printed, else null>",
      "original_currency": "<ISO 4217 if foreign txn shows original currency, else null>",
      "original_amount": <number in original currency if foreign, else null>,
      "authorization_code": "<auth code if printed, else null>",
      "rewards_earned": <points/miles/cashback for this txn if printed, else null>,
      "extra": { }
    }
  ],
  "notes_per_statement": [<optional, one entry per statement: free-form notes you couldn't pin to a structured field>],
  "notes": "<short string for anything you could not parse, or null>"
}

SIGN CONVENTION (cardholder/accountholder perspective):
- Outflows are NEGATIVE (purchases, fees, withdrawals, transfers OUT).
- Inflows are POSITIVE (paychecks, refunds, deposits, transfers IN, payments to a credit card from another account).
- For a credit-card statement, the bank usually shows charges as positive and payments/credits as negative; FLIP these to our convention: charges -> negative, payments/credits -> positive.
- For a checking/savings statement, the bank's "Withdrawals" column is negative and the "Deposits" column is positive.

TYPE GUIDANCE:
- "debit" = regular outflow (purchase or withdrawal); negative amount.
- "credit" = refund/credit; positive amount.
- "transfer" = movement between accounts (autopay credit-card payment, transfer to/from another bank, etc).
- "fee" = ATM/foreign/overdraft/maintenance/wire/service fees.
- "interest" = interest charged or earned (signed appropriately: charged is negative, earned is positive).
- "dividend" = brokerage or savings dividend (positive).
- "check" = a check transaction.

SYNTHETIC INTEREST: if the statement shows an interest charge total but no transaction row for it, emit one anyway: date = period_end, type = "interest", amount = -<interest>.

FOREIGN: set is_foreign=true if the description includes a non-US locale or currency conversion.

INSTITUTION SLUG: stable, lowercase, snake_case. Examples: capital_one, chase, bank_of_america, wells_fargo, amex, citi, fidelity, schwab, vanguard, dcu, alliant, navy_federal. Use the same slug for the same institution across statements.

TAX FORMS: If the input is a tax form (1099 composite, 1099-DIV, 1099-INT, 1099-B, 1099-MISC, W-2, 1098), recognize it via the header (e.g., "FORM 1099 COMPOSITE", "TAX YEAR <YYYY>", "Date Prepared", IRS form numbers). Emit ONE statement record with `account_type: "tax_document"`, `period_start: <year>-01-01`, `period_end: <year>-12-31`, populate the `tax_form` block, and return an EMPTY transactions array — the underlying dividend/interest/sale events are already captured on the broker's monthly statements; tax forms are summaries, not transaction sources.

If the input is not a recognizable financial statement, return:
{"statements": [], "transactions": [], "notes": "Not a recognizable statement"}

EXTRACT EVERY USEFUL DETAIL. The user wants the full picture even if some fields aren't shown in the UI yet. If the statement prints a merchant phone, save it. If it shows the city or country, save it. If it shows authorization codes, payment method, rewards earned per transaction, transaction time — save them all. Anything you can extract that doesn't fit the named fields, put in the `extra` object as `{"key": "value"}`. Be liberal with extra: better to capture and ignore than to lose information. Don't speculate or hallucinate values - only fill in what's actually printed.

QUIRKS LEARNED:
You may also include `quirks_observed` at the top level - a list of short strings (each <= 200 chars) capturing extraction tricks, layout quirks, sign-convention notes, or format-version observations specific to this institution that would help a future call parse the same provider correctly. Examples of the SHAPE such quirks should take:
  ["<Issuer> retailer-co-brand statements list merchants in CAPS without city/state",
   "<Issuer> consolidates multiple accounts (savings + checking) on one statement",
   "<Issuer> CSVs use 'Trans. Date' header (with period) and amounts are positive for purchases (must invert)"]
Write the actual quirks generically — describe the structural pattern, not the specific account or merchant names that exposed it. Only include quirks that are useful, generalizable, and NOT already covered in the Known-provider extraction notes (if those were given to you above). Empty list if nothing new to note.
"""


def parse(pages_text: list, accounts: dict, personal_path=None, filename: str | None = None, repo_root=None) -> dict[str, Any]:
    if not shutil.which("claude"):
        raise RuntimeError(
            "'claude' CLI not found in PATH. Install Claude Code or add it to PATH."
        )

    # Detect document type from filename + content. Right now we recognize:
    #   - financial statements (default)
    #   - Amazon order history exports
    if _is_amazon_orders(filename, pages_text):
        return _parse_amazon_orders(pages_text, filename)

    user_msg = _format_user_message(pages_text, accounts, filename, repo_root)

    # Headless invocation. No --bare so OAuth/keychain auth works.
    # --allowedTools "" disables tool use (we want a pure extraction call).
    cmd = [
        "claude",
        "-p", user_msg,
        "--system-prompt", _SYSTEM_PROMPT,
        "--output-format", "json",
        "--model", "opus",
        "--allowedTools", "",
    ]
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=900,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("claude CLI timed out after 15 minutes")

    if result.returncode != 0:
        raise RuntimeError(f"claude CLI failed (exit {result.returncode}): {result.stderr.strip() or result.stdout.strip()}")

    try:
        wrapper = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f"claude CLI did not return JSON. First 400 chars:\n{result.stdout[:400]}")

    extracted_text = wrapper.get("result")
    if not extracted_text:
        raise RuntimeError(f"claude CLI returned no result field. Wrapper: {wrapper}")

    parsed = _parse_json_block(extracted_text)
    source_format = "pdf"
    if filename:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "pdf"
        if ext in ("csv", "html", "htm", "txt", "tsv"):
            source_format = "html" if ext == "htm" else ext
    envelope = _to_envelope(parsed, accounts, personal_path, source_format=source_format)
    # Persist any quirks the LLM learned, scoped to the institutions in this statement.
    if repo_root and parsed.get("quirks_observed"):
        _persist_quirks(
            repo_root,
            institutions={s["institution"] for s in envelope["statements"]},
            quirks=parsed.get("quirks_observed") or [],
        )
    return envelope


_AMAZON_ORDERS_SYSTEM = """You are an Amazon order-history extractor. The input is the full text of a "Your Orders" page from Amazon (exported as PDF). Return a SINGLE JSON object listing every distinct order found. Output ONLY the JSON.

OUTPUT SHAPE:
{
  "orders": [
    {
      "order_id": "<the 'ORDER #' value, e.g. 112-6082405-5313823>",
      "date_placed": "<YYYY-MM-DD>",
      "total": <number, USD>,
      "items": [
        { "name": "<product title, full>", "quantity": <int default 1>, "price": <number or null> }
      ],
      "ship_to": "<recipient first name only or null>",
      "delivered_on": "<YYYY-MM-DD or null>",
      "payment_card_last4": "<4 digits if visible, else null>",
      "raw_block": "<the unaltered text block for this order, useful for matching>"
    }
  ]
}

Be exhaustive: include every order, even partial pages. Preserve the FULL product name. If item-level prices are not shown, set price to null but keep the item name. Currency is USD unless stated.

If the input is not an Amazon orders page, return: {"orders": [], "notes": "Not an Amazon orders page"}
"""


def _is_amazon_orders(filename, pages_text) -> bool:
    fn = (filename or "").lower()
    if "your orders" in fn or "amazon" in fn:
        return True
    head = (pages_text[0] if pages_text else "").lower()
    return "your orders" in head and "amazon" in head


def _parse_amazon_orders(pages_text, filename) -> dict:
    """Extract Amazon orders via the LLM and return a special envelope type."""
    pages = "\n\n".join(f"=== PAGE {i+1} ===\n{p}" for i, p in enumerate(pages_text))
    user_msg = (
        f"Amazon Orders export. Filename: {filename or '?'}. "
        "Extract every distinct order per the schema in your system prompt.\n\n"
        + pages
    )
    cmd = [
        "claude",
        "-p", user_msg,
        "--system-prompt", _AMAZON_ORDERS_SYSTEM,
        "--output-format", "json",
        "--model", "opus",
        "--allowedTools", "",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        raise RuntimeError("Claude CLI timed out (Amazon orders extraction)")
    if result.returncode != 0:
        raise RuntimeError(f"claude CLI failed (Amazon orders): {result.stderr.strip() or result.stdout.strip()}")

    wrapper = json.loads(result.stdout)
    extracted = wrapper.get("result", "")
    parsed = _parse_json_block(extracted)
    orders = parsed.get("orders", [])
    if not orders:
        raise RuntimeError(parsed.get("notes") or "No orders extracted from this Amazon orders page")

    # Period derived from earliest/latest order dates (used for archiving).
    dates = sorted([o["date_placed"] for o in orders if o.get("date_placed")])
    period_end = dates[-1] if dates else "unknown"
    period_start = dates[0] if dates else "unknown"

    return {
        "envelope_type": "orders",
        "vendor": "amazon",
        "orders": orders,
        "period_start": period_start,
        "period_end": period_end,
        "source_filename": filename,
    }


def _persist_quirks(repo_root, institutions: set, quirks: list) -> None:
    """Append new quirks to skill/institutions/<inst>.md, deduped against existing content.

    Each institution gets its own MD. Bullets are appended under a "## Quirks observed" section.
    Existing quirks are not duplicated (string-equality check after stripping).
    """
    inst_dir = repo_root / "skill" / "institutions"
    inst_dir.mkdir(parents=True, exist_ok=True)
    new_quirks = [q.strip() for q in quirks if q and q.strip()]
    if not new_quirks:
        return

    for inst in institutions:
        md = inst_dir / f"{inst}.md"
        if md.exists():
            text = md.read_text()
        else:
            text = (
                f"# {inst}\n\n"
                f"Notes the LLM has learned while parsing statements from this institution.\n"
                f"Used as additional context on subsequent ingest calls. Bullets are deduped\n"
                f"by string-equality; rewrite this file freely if it gets cluttered.\n\n"
                f"## Quirks observed\n\n"
            )
        # Find or create the section header.
        if "## Quirks observed" not in text:
            text = text.rstrip() + "\n\n## Quirks observed\n\n"
        # Existing bullets (lowercased for dedup).
        existing_lines = {line.strip().lower().lstrip("- ").rstrip()
                          for line in text.splitlines() if line.strip().startswith("- ")}
        added = []
        for q in new_quirks:
            if q.lower() not in existing_lines:
                added.append(q)
                existing_lines.add(q.lower())
        if added:
            text = text.rstrip() + "\n" + "\n".join(f"- {q}" for q in added) + "\n"
            md.write_text(text)


def anomaly_reason(flag: str, txn: dict) -> str:
    return {
        "fee": f"Service or interest fee from {txn.get('merchant_canonical') or txn.get('description_raw', '?')}",
        "foreign": f"Foreign transaction at {txn.get('merchant_canonical') or txn.get('description_raw', '?')}",
        "large_txn": f"Single transaction at ${abs(txn.get('amount', 0)):,.2f} above threshold",
        "round_number_large": f"Large round-number charge of ${abs(txn.get('amount', 0)):,.2f}",
        "free_trial_jump": "Charge follows a small or zero initial charge",
        "outlier_amount": "Amount deviates from merchant's historical mean",
        "new_merchant": "Never seen this merchant in trailing 12 months",
        "dup_billing": "Same merchant, same amount, within 24 hours",
        "card_test": "Multiple small charges from new merchants in short window",
        "late_night": "Multiple charges in late-night window",
        "unwanted_merchant": "Merchant flagged in personal/alerts.yaml block list",
    }.get(flag, flag)


# ---------- helpers ----------


def _format_user_message(pages_text: list, accounts: dict, filename: str | None = None, repo_root=None) -> str:
    accounts_hint = json.dumps(
        [
            {
                "id": a.get("id"),
                "institution": a.get("institution"),
                "type": a.get("type"),
                "last4": str(a.get("last4")) if a.get("last4") else None,
                "nickname": a.get("nickname"),
            }
            for a in (accounts.get("accounts") or [])
        ],
        indent=2,
    )

    # Load any institution metadata MDs (lessons learned for known providers).
    inst_notes = ""
    if repo_root:
        inst_dir = repo_root / "skill" / "institutions"
        if inst_dir.exists():
            blocks = []
            for md in sorted(inst_dir.glob("*.md")):
                if md.name == "README.md":
                    continue
                txt = md.read_text().strip()
                if txt:
                    blocks.append(f"### {md.stem}\n\n{txt}")
            if blocks:
                inst_notes = (
                    "\n\nKnown-provider extraction notes (use these as hints; "
                    "if you encounter a new quirk, add to `quirks_observed` in your output):\n\n"
                    + "\n\n".join(blocks)
                )

    file_hint = f"\nFilename: {filename}\n" if filename else ""

    pages = "\n\n".join(f"--- PAGE {i+1} ---\n{p}" for i, p in enumerate(pages_text))
    return (
        "User's known accounts (for institution-slug consistency and last4 matching):\n"
        f"{accounts_hint}\n"
        f"{file_hint}"
        f"{inst_notes}\n\n"
        "Statement text follows. The filename above is a hint about the institution; "
        "prefer it when the content is ambiguous (e.g. a CSV without obvious branding). "
        "Extract per the schema in your system prompt.\n\n"
        f"{pages}"
    )


_REPAIR_SYSTEM = """You are a JSON repair tool. The user will paste JSON-LIKE text that failed to parse. Output the corrected, parseable JSON only — no prose, no markdown, no code fences. Preserve every field and value as-is; only fix syntactic errors (missing commas/quotes/braces, trailing commas, unescaped characters, HTML entities like &amp; that broke the string, stray text outside the JSON). If you cannot recover the structure, return {}."""


def _llm_repair_json(broken: str, error: str) -> dict | None:
    """Ask the LLM to repair malformed JSON. Returns None if repair fails."""
    if not shutil.which("claude"):
        return None
    user_msg = (
        f"This JSON failed to parse with: {error}\n\n"
        f"Return only the corrected JSON.\n\n"
        f"---\n{broken}"
    )
    cmd = [
        "claude",
        "-p", user_msg,
        "--system-prompt", _REPAIR_SYSTEM,
        "--output-format", "json",
        "--model", "opus",
        "--allowedTools", "",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        return None
    if result.returncode != 0:
        return None
    try:
        wrapper = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None
    fixed = wrapper.get("result")
    if not fixed:
        return None
    # Strip any preamble or fences the repair model might have added.
    fixed = fixed.strip()
    if fixed.startswith("```"):
        fixed = re.sub(r"^```(?:json)?\s*", "", fixed)
        fixed = re.sub(r"\s*```\s*$", "", fixed)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        # Last-ditch: pull the largest braces span
        m = re.search(r"\{[\s\S]*\}", fixed)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
        return None


def _parse_json_block(text: str) -> dict:
    text = text.strip()
    # Strip a stray markdown fence if the model added one despite our instruction.
    if text.startswith("```"):
        m = re.match(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.S)
        if m:
            text = m.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        # LLM-repair pass: re-prompt the model to fix its own malformed output.
        # This handles HTML-entity collisions, unescaped characters, and minor
        # syntax slips that don't justify failing the whole ingest.
        repaired = _llm_repair_json(text, str(e))
        if repaired is not None:
            print(f"  (LLM JSON repair succeeded after first-parse error: {e})")
            return repaired
        raise RuntimeError(f"LLM returned non-JSON output: {e}\n\nFirst 600 chars:\n{text[:600]}")


def _to_envelope(parsed: dict, accounts: dict, personal_path=None, source_format: str = "pdf") -> dict[str, Any]:
    """Translate the LLM payload into the orchestrator envelope.

    A single PDF can contain multiple accounts (e.g. a credit-union statement
    listing checking + savings together). We return ALL statements and a
    transactions list where each transaction carries `_statement_idx` to route
    it. ingest.py loops the statements and dedupes/finalizes per-account.
    """
    statements_in = parsed.get("statements") or []
    transactions_in = parsed.get("transactions") or []

    if not statements_in:
        raise RuntimeError(parsed.get("notes") or "LLM did not produce any statement record")

    resolved_accounts = [_resolve_account_id(accounts, s, personal_path) for s in statements_in]
    statements = [_build_statement(s, resolved_accounts[i], source_format=source_format) for i, s in enumerate(statements_in)]

    transactions = []
    for t in transactions_in:
        idx = int(t.get("account_index") or 0)
        if idx >= len(statements):
            continue
        # Pass the statement's account_type so the normalizer can enforce sign convention.
        account_type = (statements_in[idx].get("account_type") or "").lower() or None
        txn = _build_transaction(t, resolved_accounts[idx], account_type)
        txn["_statement_idx"] = idx
        transactions.append(txn)

    return {
        "statements": statements,
        "transactions": transactions,
        "new_categories": [],
    }


def _build_statement(s_in: dict, account_id: str, source_format: str = "pdf") -> dict:
    return {
        "id": f"stmt_{s_in['institution']}_{account_id}_{s_in['period_end']}",
        "institution": s_in["institution"],
        "account_id": account_id,
        "account_type": s_in.get("account_type"),
        "period_start": s_in["period_start"],
        "period_end": s_in["period_end"],
        "issue_date": s_in.get("issue_date") or s_in["period_end"],
        "beginning_balance": s_in.get("beginning_balance"),
        "ending_balance": s_in.get("ending_balance"),
        "currency": s_in.get("currency") or "USD",
        "source_format": source_format,
        "credit_card": s_in.get("credit_card"),
        "brokerage": s_in.get("brokerage"),
        "retirement": s_in.get("retirement"),
        "loan": s_in.get("loan"),
        "utility": s_in.get("utility"),
        "toll": s_in.get("toll"),
        "insurance": s_in.get("insurance"),
        "tax_form": s_in.get("tax_form"),
    }


def _build_transaction(t: dict, account_id: str, account_type: str | None = None) -> dict:
    """Build a transaction record + apply deterministic post-LLM normalization.

    The LLM extracts; Python validates. We:
      1. Refine `type` from description regex (catches LLM mis-typing).
      2. Enforce sign convention by (account_type, type). Unambiguous combos get
         flipped if wrong.
    """
    desc_up = (t.get("description_raw") or "").upper()
    tx_type = t.get("type") or "debit"

    # Type refinement: deterministic regex on description overrides LLM choice for
    # high-confidence patterns. This catches cases where the LLM picks "debit" for
    # a row that's clearly a fee or interest.
    if re.search(r"\bINTEREST\s+(CHARGE|EARNED)\b", desc_up):
        tx_type = "interest"
    elif re.search(r"\b(SERVICE|MAINTENANCE|ATM|FOREIGN(?:\s+TRANSACTION)?|LATE(?:\s+PAYMENT)?|NSF|OVERDRAFT|WIRE|RETURNED|MEMBERSHIP|ANNUAL)\s*FEE\b", desc_up):
        tx_type = "fee"
    elif tx_type not in ("transfer", "interest", "fee", "dividend") and re.search(
        r"\b(AUTOPAY|PAYMENT\s+THANK\s+YOU|ONLINE\s+PMT|MOBILE\s+PMT|CARD\s+PAYMENT|DIRECTPAY)\b", desc_up
    ):
        tx_type = "transfer"
    elif re.search(r"\bDIVIDEND\b", desc_up) and account_type in ("savings", "checking", "brokerage"):
        tx_type = "dividend"

    amount = float(t.get("amount") or 0)

    # Sign sanity: for unambiguous (account_type, type) combinations, the sign is
    # deterministic. If the LLM got it wrong, flip and log.
    SIGN_RULES = {
        ("credit_card", "debit"):    "neg",   # purchase -> outflow
        ("credit_card", "credit"):   "pos",   # refund   -> inflow
        ("credit_card", "fee"):      "neg",
        ("credit_card", "interest"): "neg",   # interest charged
        ("credit_card", "transfer"): "pos",   # payment to card
        ("credit_card", "dividend"): "pos",
        ("checking", "debit"):       "neg",
        ("checking", "credit"):      "pos",
        ("checking", "fee"):         "neg",
        ("checking", "interest"):    "pos",   # interest earned
        ("checking", "dividend"):    "pos",
        ("savings", "debit"):        "neg",
        ("savings", "credit"):       "pos",
        ("savings", "fee"):          "neg",
        ("savings", "interest"):     "pos",
        ("savings", "dividend"):     "pos",
    }
    rule = SIGN_RULES.get((account_type or "", tx_type))
    if rule and amount != 0:
        actual = "pos" if amount > 0 else "neg"
        if actual != rule:
            print(f"  [normalize] flipped sign on '{desc_up[:50]}' (account_type={account_type}, type={tx_type}, was {amount})")
            amount = -amount

    return {
        "account_id": account_id,
        "source": "statement",
        "source_format": "pdf",
        "date_posted": t["date_posted"],
        "date_transaction": t.get("date_transaction") or t["date_posted"],
        "amount": amount,
        "currency": t.get("currency") or "USD",
        "description_raw": t["description_raw"],
        "type": tx_type,
        "check_number": t.get("check_number"),
        "reference_id": t.get("reference_id"),
        "fx_rate": t.get("fx_rate"),
        "is_foreign": t.get("is_foreign"),
        "balance_after": t.get("balance_after"),
        # Rich metadata. Optional/nullable; populated when the LLM finds it on the statement.
        "merchant_city": t.get("merchant_city"),
        "merchant_state": t.get("merchant_state"),
        "merchant_country": t.get("merchant_country"),
        "merchant_phone": t.get("merchant_phone"),
        "payment_method": t.get("payment_method"),
        "transaction_time": t.get("transaction_time"),
        "original_currency": t.get("original_currency"),
        "original_amount": t.get("original_amount"),
        "authorization_code": t.get("authorization_code"),
        "rewards_earned": t.get("rewards_earned"),
        "extra": t.get("extra") or {},
    }


def _resolve_account_id(accounts: dict, s_in: dict, personal_path=None) -> str:
    """Match a statement entry to the user's accounts.yaml.

    Match priority (strongest -> weakest):
      1. (institution, last4) exact match
      2. last4 alone uniquely matches one account (slug differs but card is the same)
      3. (institution, type) match if exactly one such account
      4. (institution, type) where the nickname contains/equals account_subname
      5. (institution, type) where existing has null last4 — fill in the last4
      6. similar institution by substring across types (e.g. amex/american_express)
      7. If personal_path is given: AUTO-CREATE a new account entry in accounts.yaml
      8. Else: raise
    """
    institution = (s_in.get("institution") or "").lower()
    account_type = s_in.get("account_type") or "checking"
    last4 = s_in.get("account_last4")
    last4 = str(last4) if last4 else None
    subname = (s_in.get("account_subname") or "").lower().strip()

    accs = accounts.get("accounts") or []

    # Tax documents (1099, W-2, 1098) always attach to an existing financial
    # account at the same institution — they are doc-level, not account-level.
    # Never auto-create a tax_document account.
    if account_type == "tax_document":
        candidates = [a for a in accs if a.get("institution") == institution]
        if last4:
            matches = [a for a in candidates if str(a.get("last4") or "") == last4]
            if matches:
                return matches[0]["id"]
        if candidates:
            # Prefer the broker-style account (brokerage/ira/roth_ira) over checking/savings.
            for preferred in ("brokerage", "ira", "roth_ira", "401k", "403b", "sep_ira", "hsa"):
                pref = [a for a in candidates if a.get("type") == preferred]
                if pref:
                    return pref[0]["id"]
            return candidates[0]["id"]
        raise RuntimeError(
            f"Tax document for institution={institution} but no underlying account "
            f"in accounts.yaml. Ingest the brokerage/IRA statement first, then re-ingest the 1099."
        )

    # 1a. (institution, last4, type) exact — prefer same-type match before
    # falling back to type-agnostic last4 match (so a 1099 doesn't capture
    # a brokerage statement and vice versa).
    if last4:
        for a in accs:
            if (a.get("institution") == institution
                and str(a.get("last4") or "") == last4
                and a.get("type") == account_type):
                return a["id"]

    # 1b. (institution, last4) exact, any type
    if last4:
        for a in accs:
            if a.get("institution") == institution and str(a.get("last4") or "") == last4:
                return a["id"]

    # 2. last4 alone uniquely matches
    if last4:
        last4_matches = [a for a in accs if str(a.get("last4") or "") == last4]
        if len(last4_matches) == 1:
            return last4_matches[0]["id"]

    candidates = [a for a in accs if a.get("institution") == institution]

    # 3. (institution, type) unique
    same_type = [a for a in candidates if a.get("type") == account_type]
    if len(same_type) == 1 and not same_type[0].get("last4") or (
        len(same_type) == 1 and last4 and str(same_type[0].get("last4") or "") == last4
    ):
        # 5. fill in last4 on the matched account if it was null
        a = same_type[0]
        if last4 and not a.get("last4") and personal_path:
            _update_account_last4_inplace(personal_path, a["id"], last4)
            a["last4"] = last4
        return a["id"]

    # 4. nickname contains/equals subname
    if subname and same_type:
        for a in same_type:
            ann = (a.get("nickname") or "").lower()
            if subname == ann or subname in ann or ann in subname:
                return a["id"]

    # 6. similar institution slug (substring)
    if institution:
        for a in accs:
            ainst = (a.get("institution") or "").lower()
            if not ainst or ainst == institution:
                continue
            if institution in ainst or ainst in institution:
                if a.get("type") == account_type:
                    return a["id"]
                if last4 and str(a.get("last4") or "") == last4:
                    return a["id"]

    # 7. auto-create
    if personal_path is not None:
        return _auto_add_account(personal_path, accounts, institution, account_type, last4, s_in.get("account_subname"))

    raise ValueError(
        f"No account in personal/accounts.yaml matches institution={institution} "
        f"type={account_type} last4={last4 or 'n/a'} subname={s_in.get('account_subname') or 'n/a'}.\n"
        f"Pass personal_path to enable auto-add, or add the account manually."
    )


def _update_account_last4_inplace(personal_path, account_id: str, last4: str) -> None:
    """Update the last4 field of an existing account in accounts.yaml. Best-effort
    line-level edit so existing comments/formatting are preserved."""
    p = personal_path / "accounts.yaml"
    if not p.exists():
        return
    text = p.read_text()
    lines = text.splitlines()
    in_target = False
    new_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("- id:"):
            in_target = stripped == f"- id: {account_id}"
        if in_target and stripped.startswith("last4:"):
            indent = line[: len(line) - len(line.lstrip())]
            line = f'{indent}last4: "{last4}"'
        new_lines.append(line)
    p.write_text("\n".join(new_lines) + ("\n" if text.endswith("\n") else ""))


def _auto_add_account(personal_path, accounts: dict, institution: str, account_type: str, last4, subname) -> str:
    """Append a new account entry to accounts.yaml and update the in-memory dict.
    Comments and formatting in accounts.yaml are preserved (we append plain text)."""
    file_path = personal_path / "accounts.yaml"
    existing_ids = {a.get("id") for a in (accounts.get("accounts") or [])}

    base = f"{institution}_{account_type}"
    new_id = base
    if new_id in existing_ids:
        n = 2
        while f"{base}_{n}" in existing_ids:
            n += 1
        new_id = f"{base}_{n}"

    nickname = subname or institution.replace("_", " ").title()
    last4_yaml = f'"{last4}"' if last4 else "null"

    # Detect existing list indentation: peek at the file and find an existing
    # `- id:` / `  - id:` line under `accounts:`. New entries must match.
    indent = ""
    if file_path.exists():
        try:
            text = file_path.read_text()
            m = re.search(r"^accounts:\s*\n((?:\s*-\s*id:.*\n))", text, flags=re.MULTILINE)
            if m:
                first_item = m.group(1)
                indent = first_item[: len(first_item) - len(first_item.lstrip(" "))]
        except Exception:
            indent = ""
    item_pad = indent
    field_pad = " " * (len(indent) + 2)

    block = (
        "\n"
        f"{item_pad}- id: {new_id}\n"
        f"{field_pad}institution: {institution}\n"
        f"{field_pad}type: {account_type}\n"
        f"{field_pad}last4: {last4_yaml}\n"
        f'{field_pad}nickname: "{nickname}"\n'
        f"{field_pad}currency: USD\n"
        f"{field_pad}statement_format: pdf\n"
    )
    # Append. First normalize "accounts: []" → "accounts:" so the new
    # block becomes a valid list item under the key (otherwise YAML
    # parsing breaks: an empty-list marker can't be followed by - items).
    file_path.parent.mkdir(parents=True, exist_ok=True)
    if file_path.exists():
        text = file_path.read_text()
        if re.search(r"^accounts:\s*\[\s*\]\s*$", text, flags=re.MULTILINE):
            text = re.sub(r"^accounts:\s*\[\s*\]\s*$", "accounts:", text, flags=re.MULTILINE)
            file_path.write_text(text)
        elif not re.search(r"^accounts:\s*$", text, flags=re.MULTILINE) and not re.search(r"^accounts:\s*\n\s*-", text, flags=re.MULTILINE):
            # No accounts: key at all yet — append one.
            if not text.endswith("\n"):
                text += "\n"
            text += "accounts:\n"
            file_path.write_text(text)
    else:
        file_path.write_text("accounts:\n")
    with file_path.open("a") as f:
        f.write(block)

    # Update in-memory dict so subsequent statements in the same file can match.
    accounts.setdefault("accounts", []).append({
        "id": new_id,
        "institution": institution,
        "type": account_type,
        "last4": last4,
        "nickname": nickname,
        "currency": "USD",
        "statement_format": "pdf",
    })
    print(f"  + auto-added account: {new_id} (institution={institution}, type={account_type}, last4={last4 or 'n/a'})")
    return new_id
