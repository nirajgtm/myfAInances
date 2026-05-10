---
name: finance
description: Local-first personal finance tracking. Ingests bank/card statements (PDF, CSV) from a configured inbox, dedupes them, extracts transactions, categorizes (rules + aliases + AI), detects subscriptions and anomalies, and writes structured monthly JSON reports. Use when the user asks about spending, subscriptions, weird charges, monthly summaries, or wants to process a new statement. System lives at ~/claude-configs/finance/.
---

# Finance Skill

You are the finance skill. The user drops PDF or CSV statements into a configured inbox; you ingest, dedupe, extract, categorize, detect subscriptions and anomalies, and answer questions over the resulting JSON DB.

## First step on every invocation

1. Locate the config file. Resolution order:
   - `$FINANCE_CONFIG` env var, if set, points to the config file path.
   - `~/.config/finance/data_root` (a one-line file written by init.sh) holds the data root. Config is at `<data_root>/config.yaml`.
   - Fallback: `~/claude-configs/finance-data/config.yaml`.
2. If no config is found, tell the user to run `bash ~/claude-configs/finance/scripts/init.sh` and stop.
3. Read all paths from config. Never hard-code paths in any sub-document.
4. Decide what the user is asking for:
   - Process new statements (default if inbox has files): see `core/workflow.md`.
   - Answer a question about existing data: see `features/qa.md`.
   - Generate a report for a period: see `features/reporting.md`.

## Hierarchy of docs (read only what you need)

- `core/paths.md` resolves all filesystem locations from config.
- `core/workflow.md` is the end-to-end ingestion loop.
- `core/dedup.md` defines the 3-layer dedup contract. Apply on every ingest.
- `core/db-schema.md` is the JSON contract for every file under `db/`.
- `extraction/fields.md` is the canonical field list every parser produces.
- `features/` holds spending, subscriptions, anomalies, credit, reporting, qa.
- `categorization/` holds the controlled-vocabulary rules and AI guardrails.
- `ops/` holds backup and retention.

## Hard rules

1. **Dedup is mandatory.** Never insert a transaction without running the 3 layers in `core/dedup.md`.
2. **No personal data in the skill tree or repo.** Account numbers, real merchant histories, and personal rules live in `<data_root>/personal/`, which is outside the git repo. Never write personal data into any file inside `skill/`, `scripts/`, `examples/`, or the repo root.
3. **Categories are a controlled vocabulary.** When AI proposes a new category, run the dedup check in `categorization/README.md` first.
4. **Reports are JSON first.** Markdown is rendered from JSON. Schema in `core/db-schema.md`.
5. **Surface flags, never auto-act.** Cancellation candidates and anomalies are recommendations the user reviews. Do not unsubscribe, dispute, or move money.
6. **Idempotent.** Re-ingesting the same statement must be a no-op. Re-running detection passes must produce stable results.
7. **Scaffold before you process.** Any new type of input (new file format, new account type, new question class, new error pattern) requires creating the matching MD or script in the skill tree FIRST, then processing. Never inline-handle a new type without leaving behind the scaffolding that future invocations will need. Surface a one-line note to the user listing what was added.
8. **Parser is LLM-native.** `scripts/parser.py` handles every institution by calling the local Claude CLI in headless mode (no API key; uses the user's Claude subscription). The orchestrator does not know any institution by name and does not encode any per-institution layout. If a deterministic parser is ever added for a high-volume institution, it lives at `scripts/parsers/<institution>.py` (sibling), never in the orchestrator.
