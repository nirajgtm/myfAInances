# Backup and Restore

The DB is plain JSON files plus the personal config. Backup is a tarball of these. No external service.

## What to back up

- `config.yaml`
- `personal/`
- `db/`
- `archive/` (optional; large but reproducible from inbox if you keep originals elsewhere)

Do NOT back up `inbox/` (transient) or `extracted/` (rebuilt from `archive/`).

## Backup script behavior

Invoke with: `bash scripts/backup.sh [target_path]`

- Default target: `~/finance-backups/finance-<YYYYMMDD-HHMMSS>.tar.gz`
- Includes `config.yaml`, `personal/`, `db/` by default.
- `--with-archive` flag includes `archive/` too.
- Prints the path and size of the resulting file.

## Restore

Invoke with: `bash scripts/restore.sh <backup.tar.gz>`

- Refuses to run if `db/` already has non-empty JSON files. Ask for `--force` to overwrite.
- Extracts to `$REPO_ROOT/`.
- Re-runs `init.sh --skip-config` to reseat any missing directories or symlinks.

## Schedule

Not automated. Run on demand or wire into a cron yourself. The skill never schedules backups silently.

## Encryption

v1: not encrypted. The DB is plaintext JSON.
v2: optional `--encrypt` flag using `age` keys, with a corresponding `--decrypt` on restore.

## Verification after restore

The skill, on next invocation, validates:
- Every file under `db/` parses as JSON.
- `processed.json` keys match SHA-256 hex format.
- Every transaction's `statement_id` resolves to a record in `statements.json`.

If validation fails, the skill aborts and surfaces the specific corruption to the user.
