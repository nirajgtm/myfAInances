# Retention

Default: keep everything forever.

## Settings (in config.yaml)

```
retention:
  delete_archive_after_days: 0    # 0 = never delete; integer N = purge files in archive/ older than N days
  redact_account_numbers_in_logs: true
```

## What gets pruned

If `delete_archive_after_days > 0`, the skill deletes files in `archive/` whose mtime is older than the threshold. The DB records (statements, transactions, etc.) are NEVER deleted by retention. Only the original PDF/CSV files.

## Logs

The skill writes minimal logs to `db/log.txt` (append-only). Anything printed includes redacted account numbers (last 4 only) when `redact_account_numbers_in_logs: true`. This applies to:
- File hash records (filenames may include account numbers).
- Error messages mentioning specific accounts.
- Debug dumps in `extracted/`.

## Inbox cleanup

Files are moved out of `inbox/` after successful ingestion. Files that fail to ingest stay in place until the user fixes them or removes them manually. The skill never deletes a file from the inbox.

## Extracted artifacts

`extracted/<statement_id>/` is debug-grade. Safe to delete any time. The skill regenerates on next ingest of the same statement (which will not happen because of dedup, so once extracted, it stays unless you manually delete).
