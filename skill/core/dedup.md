# Dedup

Three layers. All are mandatory on every ingest.

## Layer 1: File hash

- Compute SHA-256 of the file's raw bytes.
- Lookup in `db/processed.json` (keyed by hash).
- If present: skip the file entirely. Move to archive. Done.
- If absent: continue. Record after successful ingest with shape `{ "<hash>": { "statement_id": "...", "ingested_at": "..." } }`.

This catches the case where the user re-drops the same file.

## Layer 2: Statement key

After extracting statement metadata but before inserting transactions:

- Build the key: `(institution, account_id, period_start, period_end)`.
- Search `db/statements.json` for an existing record with the same key.
- If found: skip the file. Move to archive. Log "duplicate statement, different bytes".
- If not found: continue.

This catches re-downloads where the PDF/CSV was re-saved (different bytes, same content).

## Layer 3: Transaction key

For each extracted transaction, before inserting into `db/transactions.json`:

Use this key, in order of preference:
1. **OFX FITID or reference_id** if present (deferred to v2 when OFX support lands; for now, applies only when CSV exports include a stable reference column).
2. **Composite fallback:** `(account_id, date_posted, amount, description_normalized_first_40_chars, sequence_in_day)` where `sequence_in_day` is the index of this transaction among same-day same-amount same-merchant duplicates within this statement (0, 1, 2 ...).

If a key collides with an existing transaction:
- If `statement_id` matches: drop silently (re-ingestion of same statement).
- If `statement_id` differs but everything else matches: log a warning and drop. This usually means overlapping statement periods.

## Atomicity

- Read the whole JSON file, mutate in memory, write to a temp file in the same directory, fsync, rename over the target.
- Never write partial state. A crash mid-ingest must leave the DB in its previous-good state.
- Acquire a process-level lock (e.g., a file at `db/.lock`) so concurrent ingests do not race.

## Dedup across multiple files in one batch

If the user drops several statements at once where the periods overlap (e.g., a re-issued statement covering the same dates, or two banks emailing the same transaction), every layer still applies:

- Same bytes -> layer 1 stops it.
- Different bytes, same `(institution, account, period)` -> layer 2 stops it.
- Different periods that share individual transactions -> layer 3 dedupes the overlap.

The orchestrator processes files in alphabetical order; the first file in is canonical, subsequent files only contribute new transactions.

## Dedup with LLM-extracted records

The LLM parser may produce slightly different `description_raw` text on repeat ingests of the same statement (e.g., different whitespace, varying punctuation). Layer 3's key uses `description_normalized[:40]` rather than the raw text. The normalizer (`ingest.py:normalize_description`) uppercases, collapses whitespace, and inserts spaces at letter/digit boundaries. This neutralizes most LLM variability so dedup still fires.

If the LLM produces materially different descriptions across runs (e.g., expands "AMZN MKTP" to "Amazon Marketplace" on one pass and "AMZN MKTP" on another), normalization will not catch it and you will get a duplicate. Mitigation: the system prompt in `scripts/parser.py` instructs the model to copy `description_raw` verbatim. If duplicates still slip through, tighten the prompt or write a deterministic parser for that institution.

## What dedup does NOT cover

- Two different statements with overlapping periods (e.g., a special "interim" statement and the regular monthly). Layer 2 will not catch this; layer 3 will dedupe individual transactions if their keys collide. If your bank issues such statements, expect a few "duplicate transaction warnings" in the log; this is correct behavior.
- Manual entries that the user later finds on a statement. Manual transactions have `source=manual`. When a statement transaction matches a manual one (same date, amount, merchant), the skill prompts the user to either keep both or replace the manual with the statement-sourced version.
