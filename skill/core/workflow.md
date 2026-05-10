# Ingestion Workflow

End-to-end loop the skill runs when the user invokes it with statements in the inbox.

## Steps

1. **Resolve paths** from `config.yaml` per `paths.md`.
2. **Scan inbox.** List every file in `inbox_path` with extension `.pdf`, `.csv`. Ignore everything else.
3. **For each file, in order:**
   1. Compute SHA-256 of file contents.
   2. **Dedup layer 1 (file hash):** if hash is in `db/processed.json`, log "skipped duplicate file", move file to `archive/<YYYY-MM>/`, continue.
   3. **Identify institution and account.** Match by filename hints first, then content sniff. Cross-check with `personal/accounts.yaml`. If unknown, prompt user to either pick an existing account id or define a new one (then update accounts.yaml).
   4. **Extract.** Call `scripts/parser.py` `parse(pages_text, accounts)`. The parser is LLM-native and institution-agnostic; see `extraction/fields.md` for the canonical fields it must produce.
   5. **Extract statement metadata** (institution, account_id, period_start, period_end, beginning_balance, ending_balance, plus card-specific or brokerage-specific fields per `core/db-schema.md`).
   6. **Dedup layer 2 (statement key):** if `(institution, account_id, period_start, period_end)` is already in `db/statements.json`, log "skipped duplicate statement", move to archive, continue.
   7. **Extract transactions.** Apply normalization (description_normalized, merchant_canonical via `personal/aliases.yaml` and `db/merchants.json`).
   8. **Dedup layer 3 (transaction key):** apply per `core/dedup.md`. Drop duplicates.
   9. **Categorize.** Run rule + alias + AI pipeline per `categorization/README.md`. Tag tax_tag where applicable.
   10. **Tag anomaly flags** per `features/anomalies.md`. Set `anomaly_flags` array on each transaction. Append events to `db/anomalies.json`.
   11. **Update merchant registry** `db/merchants.json`.
   12. **Append to** `db/transactions.json` and `db/statements.json`.
   13. **Record file hash** in `db/processed.json` with statement_id reference.
   14. **Save raw extraction artifact** under `extracted/<statement_id>/raw.json` for debugging.
   15. **Move file** from inbox to `archive/<YYYY-MM>/` where YYYY-MM is the statement period_end.
4. **After all files ingested, run derived passes:**
   1. Subscription detection per `features/subscriptions.md`. Update `db/subscriptions.json`.
   2. Anomaly review per `features/anomalies.md` (some flags require historical context only available after ingest, e.g., new-merchant detection across all accounts).
5. **Generate the period report** per `features/reporting.md` for any month that received new data. Write to `db/reports/<YYYY-MM>.json` and render markdown alongside.
6. **Summarize** to the user: how many files processed, transactions added, anomalies flagged, new categories created, cancellation candidates surfaced. Point at the report path.

## On failure

- If extraction fails (corrupt file, unknown format), do not move the file. Write an error note to `extracted/<filename>.error.txt` and continue with the next file.
- If categorization AI fails, leave the transaction with `category=null` and `categorized_by=null`. The next run retries.
- Never partially write JSON files. Read, mutate in memory, write the whole file atomically (write to temp, rename).
