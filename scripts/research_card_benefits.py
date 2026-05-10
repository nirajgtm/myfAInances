"""Research each credit card's published benefits via Claude CLI (with web tools).

Writes results into personal/accounts.yaml under each card's `benefits:` block,
with a `last_validated` ISO timestamp. Re-runs only for cards that have no
`benefits` or whose `last_validated` is older than 30 days.

Run as a standalone:
    python3 scripts/research_card_benefits.py
Or invoked from ingest.py main().
"""

from __future__ import annotations

import datetime
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import yaml


CACHE_DAYS = 30
SUPPORTED_TYPES = {"credit_card"}


_SYSTEM_PROMPT = """You research published credit-card benefits for a personal-finance app. Use web search and web fetch as needed to find the issuer's current published rates and perks.

For the card the user describes, return ONE JSON object exactly matching this schema. Output ONLY the JSON. No prose, no markdown fences.

{
  "card_full_name": "<best guess at the canonical card name as marketed by the issuer>",
  "annual_fee": <number USD per year, 0 if no fee>,
  "points_value_cents": <number; cents-per-point at typical redemption (e.g. 1.0 for cash-back at face value, higher for transfer partners on travel-rewards cards)>,
  "categories": [
    { "match": "*", "rate": <number>, "unit": "x | %", "scope": "<short scope or null>" },
    { "match": "<category id like 'flights', 'hotels', 'dining_out', 'groceries', 'gas', 'streaming', 'rideshare', 'entertainment'>", "rate": <number>, "unit": "x | %", "scope": "<short scope or null>" }
  ],
  "perks": [
    {
      "name": "<concise perk title>",
      "group": "travel | dining | rewards | fees | insurance | concierge | other",
      "annual": <true if it resets/issues annually>,
      "description": "<2-4 sentence plain-English explanation of what this perk gives you, terms/limits, how to claim if non-obvious>",
      "how_to_use_url": "<canonical URL to the issuer's page where the user can use/claim/manage this perk, or null>"
    }
  ],
  "issuer_url": "<best canonical issuer URL for this card>",
  "research_notes": "<short string of caveats, e.g. 'rates verified Apr 2026; Q1 5% category rotates'>"
}

If you cannot find solid info for the card, set unknown numerics to null and add a note. Map category names to OUR controlled vocabulary slugs whenever possible:
- "flights", "hotels", "travel" (generic), "dining_out", "groceries", "gas", "streaming", "rideshare", "transit", "entertainment", "shopping", "pharmacy", "phone", "internet"
For category match patterns the issuer doesn't have a direct match, use "*" with a `scope` describing it.
"""


def _load_accounts_yaml(personal_path: Path) -> tuple[Path, dict, str]:
    """Return (path, parsed_yaml, raw_text)."""
    p = personal_path / "accounts.yaml"
    raw = p.read_text()
    return p, yaml.safe_load(raw) or {}, raw


def _is_stale(last_validated: str | None) -> bool:
    if not last_validated:
        return True
    try:
        ts = datetime.datetime.fromisoformat(last_validated.replace("Z", "+00:00"))
    except Exception:
        return True
    age = datetime.datetime.now(datetime.timezone.utc) - ts.astimezone(datetime.timezone.utc)
    return age.days >= CACHE_DAYS


def _research_card(card: dict) -> dict | None:
    """Run one Claude CLI call (with web tools) for this card. Returns parsed JSON or None."""
    if not shutil.which("claude"):
        print("  (claude CLI not in PATH; skipping web research)")
        return None

    descriptor_lines = [
        f"Institution slug: {card.get('institution')}",
        f"Type: {card.get('type')}",
        f"Nickname (user's label): {card.get('nickname')}",
    ]
    if card.get("card_product"):
        descriptor_lines.append(f"Card network/product hint: {card['card_product']}")
    if card.get("last4"):
        descriptor_lines.append(f"Last 4: {card['last4']} (for human reference, not searchable)")

    user_msg = (
        "Research the following credit card and return its published benefits per the schema in your system prompt.\n\n"
        + "\n".join(descriptor_lines)
        + "\n\n"
        "Use web search to confirm current rates. If multiple cards share the nickname, pick the most likely product based on the institution + network."
    )

    cmd = [
        "claude", "-p", user_msg,
        "--system-prompt", _SYSTEM_PROMPT,
        "--output-format", "json",
        "--model", "opus",
        "--allowedTools", "WebSearch WebFetch",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired:
        print(f"  (research timeout for {card.get('id')})")
        return None
    if result.returncode != 0:
        print(f"  (research failed for {card.get('id')}: {result.stderr.strip()[:200] or result.stdout[:200]})")
        return None

    try:
        wrapper = json.loads(result.stdout)
        text = wrapper.get("result", "").strip()
        if text.startswith("```"):
            m = re.match(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.S)
            if m:
                text = m.group(1).strip()
        data = json.loads(text)
    except (json.JSONDecodeError, KeyError) as e:
        print(f"  (research returned non-JSON for {card.get('id')}: {e})")
        return None
    return data


def _merge_benefits(researched: dict) -> dict:
    """Translate the LLM payload into our `benefits:` block shape."""
    benefits = {}
    if researched.get("annual_fee") is not None:
        benefits["annual_fee"] = researched["annual_fee"]
    if researched.get("points_value_cents") is not None:
        benefits["points_value_cents"] = researched["points_value_cents"]

    categories = []
    for c in researched.get("categories") or []:
        if c.get("match") and c.get("rate") is not None:
            entry = {"match": c["match"], "rate": c["rate"], "unit": c.get("unit") or "x"}
            if c.get("scope"):
                entry["scope"] = c["scope"]
            categories.append(entry)
    if categories:
        benefits["categories"] = categories

    perks = []
    for p in researched.get("perks") or []:
        if p.get("name"):
            entry = {"name": p["name"], "group": p.get("group") or "other"}
            if p.get("annual"):
                entry["annual"] = True
            if p.get("description"):
                entry["description"] = p["description"]
            if p.get("how_to_use_url"):
                entry["how_to_use_url"] = p["how_to_use_url"]
            perks.append(entry)
    if perks:
        benefits["perks"] = perks

    if researched.get("issuer_url"):
        benefits["issuer_url"] = researched["issuer_url"]
    if researched.get("card_full_name"):
        benefits["card_full_name"] = researched["card_full_name"]
    if researched.get("research_notes"):
        benefits["research_notes"] = researched["research_notes"]

    benefits["last_validated"] = datetime.datetime.utcnow().isoformat() + "Z"
    return benefits


def _write_benefits_to_yaml(p: Path, account_id: str, benefits: dict) -> None:
    """Update or insert the `benefits:` field for one account_id.
    Round-trips through PyYAML (comments will be dropped if present)."""
    parsed = yaml.safe_load(p.read_text()) or {}
    accounts = parsed.get("accounts") or []
    found = False
    for a in accounts:
        if a.get("id") == account_id:
            a["benefits"] = benefits
            found = True
            break
    if not found:
        return
    parsed["accounts"] = accounts
    p.write_text(yaml.safe_dump(parsed, sort_keys=False, allow_unicode=True, indent=2, default_flow_style=False))


def research_all_cards(personal_path: Path, force: bool = False) -> dict:
    """Research benefits for every card with no benefits or stale last_validated.

    Returns {"researched": [card_id], "skipped": [card_id]}.
    """
    p, parsed, raw = _load_accounts_yaml(personal_path)
    accounts = parsed.get("accounts") or []
    researched: list[str] = []
    skipped: list[str] = []

    for card in accounts:
        if card.get("type") not in SUPPORTED_TYPES:
            continue
        existing = (card.get("benefits") or {})
        last_validated = existing.get("last_validated")
        if not force and existing and not _is_stale(last_validated):
            skipped.append(card["id"])
            continue

        print(f"  researching {card['id']} ({card.get('institution')} - {card.get('nickname')})...")
        result = _research_card(card)
        if not result:
            skipped.append(card["id"])
            continue
        benefits = _merge_benefits(result)
        _write_benefits_to_yaml(p, card["id"], benefits)
        researched.append(card["id"])
        print(f"    saved benefits for {card['id']}")

    return {"researched": researched, "skipped": skipped}


def main(argv: list[str]) -> int:
    cfg_path = Path.home() / "claude-configs/finance-data/config.yaml"
    if not cfg_path.exists():
        print("config.yaml not found")
        return 1
    cfg = yaml.safe_load(cfg_path.read_text())
    personal_path = Path(cfg["personal_path"])
    force = "--force" in argv
    result = research_all_cards(personal_path, force=force)
    print(f"\nDone. Researched: {len(result['researched'])}, skipped: {len(result['skipped'])}")
    if result["researched"]:
        print(f"  researched ids: {', '.join(result['researched'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
