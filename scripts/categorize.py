#!/usr/bin/env python3
"""
categorize.py: Apply category assignments to transactions.

This is the second pass after `ingest.py`. The ingest pass categorizes everything
that matches a rule. This pass takes care of the rest, typically by AI assignment
made in conversation with Claude. The mapping file is the contract.

Mapping file format (JSON):
{
  "new_categories": [
    { "id": "ai_tools", "name": "AI Tools", "parent": "subscriptions",
      "aliases": ["AI Services"], "example_merchants": ["Claude.ai"] }
  ],
  "txn_overrides": [
    {
      "txn_id": "txn_abc123",
      "category": "ai_tools",
      "merchant_canonical": "Claude.ai",
      "confidence": 0.95,
      "categorized_by": "ai",
      "tax_tag": null
    }
  ]
}

New categories are subject to a dedup check against existing names and aliases.
If a near-duplicate exists, the script aborts with a suggestion to use the
existing category id instead. Override with `--force-new-category <id>`.

Usage:
  python3 scripts/categorize.py <mapping.json>
  python3 scripts/categorize.py <mapping.json> --force-new-category ai_tools
"""

from __future__ import annotations

import os
import sys
import json
import datetime
import difflib
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parent.parent


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


def category_similarity(name: str, aliases: list[str], existing: dict) -> float:
    """Highest similarity score against name or any alias of an existing category."""
    candidates = [existing["name"]] + list(existing.get("aliases", []) or [])
    new_strings = [name] + list(aliases or [])
    best = 0.0
    for a in new_strings:
        for b in candidates:
            ratio = difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()
            if ratio > best:
                best = ratio
    return best


def add_new_categories(new_cats: list[dict], categories: list[dict], force_ids: set[str], threshold: float = 0.75) -> list[dict]:
    """Append new categories after dedup check. Returns updated category list.

    Dedup intentionally skips the new category's stated parent (and ancestor chain),
    since a child is allowed to have a name similar to its parent (e.g., "AI Tools"
    under "Subscriptions" with alias "AI Subscriptions" should not collide with the
    parent itself).
    """
    by_id = {c["id"]: c for c in categories}
    now = datetime.datetime.utcnow().isoformat() + "Z"
    for nc in new_cats:
        if nc["id"] in by_id:
            print(f"  category already exists: {nc['id']} (skipping)")
            continue
        if nc["id"] in force_ids:
            categories.append(_finalize_new_cat(nc, now))
            print(f"  + category (forced): {nc['id']} ({nc['name']})")
            continue

        # Walk the new category's parent chain so we can exclude those from dedup
        ancestor_ids: set[str] = set()
        cur = nc.get("parent")
        while cur:
            ancestor_ids.add(cur)
            parent_entry = by_id.get(cur)
            cur = parent_entry.get("parent") if parent_entry else None

        # dedup against every existing category that is NOT in the ancestor chain
        worst_match = None
        worst_score = 0.0
        for existing in categories:
            if existing["id"] in ancestor_ids:
                continue
            score = category_similarity(nc["name"], nc.get("aliases", []), existing)
            if score > worst_score:
                worst_score = score
                worst_match = existing
        if worst_score >= threshold and worst_match is not None and not worst_match.get("frozen"):
            sys.exit(
                f"\nCategory '{nc['name']}' (id={nc['id']}) has similarity {worst_score:.2f} "
                f"with existing '{worst_match['name']}' (id={worst_match['id']}).\n"
                f"Use the existing id, OR re-run with --force-new-category {nc['id']} to override."
            )
        if worst_match is not None and worst_match.get("frozen"):
            sys.exit(
                f"\nCategory '{nc['name']}' is similar to frozen category '{worst_match['name']}'. "
                f"Frozen categories cannot have AI-added siblings. Use id={worst_match['id']} instead."
            )
        categories.append(_finalize_new_cat(nc, now))
        print(f"  + category: {nc['id']} ({nc['name']})  similarity-to-closest={worst_score:.2f}")
    return categories


def _finalize_new_cat(nc: dict, now: str) -> dict:
    return {
        "id": nc["id"],
        "name": nc["name"],
        "parent": nc.get("parent"),
        "aliases": nc.get("aliases", []),
        "created_by": nc.get("created_by", "ai"),
        "created_at": now,
        "frozen": False,
        "example_merchants": nc.get("example_merchants", []),
    }


def apply_overrides(overrides: list[dict], txns: list[dict], category_ids: set[str]) -> int:
    """Mutate txns in-place. Return count of changed transactions."""
    by_id = {t["id"]: t for t in txns}
    changed = 0
    for ov in overrides:
        txn = by_id.get(ov["txn_id"])
        if not txn:
            print(f"  WARN: txn_id not found: {ov['txn_id']}")
            continue
        cat = ov.get("category")
        if cat and cat not in category_ids:
            sys.exit(f"category id '{cat}' does not exist (txn_id={ov['txn_id']}). Add it under new_categories.")
        if cat is not None:
            txn["category"] = cat
            txn["category_confidence"] = float(ov.get("confidence", 0.85))
            txn["categorized_by"] = ov.get("categorized_by", "ai")
        if "merchant_canonical" in ov and ov["merchant_canonical"]:
            txn["merchant_canonical"] = ov["merchant_canonical"]
        if "tax_tag" in ov:
            txn["tax_tag"] = ov["tax_tag"]
        if "subscription_candidate" in ov:
            txn["subscription_candidate"] = bool(ov["subscription_candidate"])
        changed += 1
    return changed


def update_merchants_registry(txns: list[dict], db_path: Path) -> None:
    """Rebuild merchants.json from current transactions."""
    by_name: dict[str, dict] = {}
    for t in txns:
        name = t.get("merchant_canonical")
        if not name:
            continue
        m = by_name.get(name)
        if not m:
            m = {
                "canonical_name": name,
                "raw_descriptions": [],
                "categories_seen": {},
                "first_seen": t["date_posted"],
                "last_seen": t["date_posted"],
                "charge_count": 0,
            }
            by_name[name] = m
        if t["description_raw"] not in m["raw_descriptions"]:
            m["raw_descriptions"].append(t["description_raw"])
        if t.get("category"):
            m["categories_seen"][t["category"]] = m["categories_seen"].get(t["category"], 0) + 1
        m["first_seen"] = min(m["first_seen"], t["date_posted"])
        m["last_seen"] = max(m["last_seen"], t["date_posted"])
        m["charge_count"] += 1
    save_json_atomic(db_path / "merchants.json", list(by_name.values()))


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        sys.exit("Usage: python3 scripts/categorize.py <mapping.json> [--force-new-category <id>]...")

    mapping_path = Path(argv[1])
    force_ids: set[str] = set()
    i = 2
    while i < len(argv):
        if argv[i] == "--force-new-category" and i + 1 < len(argv):
            force_ids.add(argv[i + 1])
            i += 2
        else:
            sys.exit(f"unknown arg: {argv[i]}")

    mapping = json.loads(Path(mapping_path).read_text())
    cfg = load_config()
    db_path = Path(cfg["db_path"])

    categories = load_json(db_path / "categories.json", [])
    txns = load_json(db_path / "transactions.json", [])

    print(f"Loaded {len(categories)} categories and {len(txns)} transactions.")

    new_cats = mapping.get("new_categories", [])
    if new_cats:
        categories = add_new_categories(new_cats, categories, force_ids)
        save_json_atomic(db_path / "categories.json", categories)

    cat_ids = {c["id"] for c in categories}
    overrides = mapping.get("txn_overrides", [])
    if overrides:
        n = apply_overrides(overrides, txns, cat_ids)
        save_json_atomic(db_path / "transactions.json", txns)
        update_merchants_registry(txns, db_path)
        print(f"Updated {n} transactions and rebuilt merchants.json.")

    # Quick stats
    uncategorized = sum(1 for t in txns if not t.get("category"))
    print(f"Uncategorized remaining: {uncategorized} of {len(txns)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
