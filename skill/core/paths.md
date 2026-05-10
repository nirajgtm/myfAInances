# Paths

Single source of truth for filesystem locations. Every other doc references this.

## Two roots

- **`repo_root`** is the git repo at `~/claude-configs/finance/`. Contains only the skill, scripts, examples, README, and .gitignore. No user data, ever.
- **`data_root`** is the personal data directory, outside the repo. Default `~/claude-configs/finance-data/`. Contains config, personal configs, inbox, archive, db, extracted artifacts.

These are always separate. The skill never writes user data inside `repo_root`.

## Config file resolution

Order:

1. `$FINANCE_CONFIG` env var, if set, is the config file path.
2. `~/.config/finance/data_root` (a one-line file written by init.sh) holds `<data_root>`. Config is at `<data_root>/config.yaml`.
3. Fallback: `~/claude-configs/finance-data/config.yaml`.

If none exist, instruct the user to run `bash ~/claude-configs/finance/scripts/init.sh` and stop.

## config.yaml keys

```
data_root:        the data directory (outside the repo)
repo_root:        the git repo containing skill/, scripts/, examples/
inbox_path:       directory where the user drops new statements (default: <data_root>/inbox)
archive_path:     directory where processed files are moved (default: <data_root>/archive)
db_path:          directory holding all JSON state files (default: <data_root>/db)
extracted_path:   directory holding per-statement extraction artifacts (default: <data_root>/extracted)
personal_path:    directory holding personal/*.yaml configs (always <data_root>/personal)
skill_path:       absolute path to the skill (always <repo_root>/skill)
```

The user can relocate inbox, archive, db, and extracted to anywhere on disk. Personal and skill paths are not user-configurable.

## Derived files (always under db_path)

- `processed.json`     file-hash registry (dedup layer 1)
- `statements.json`    statement metadata
- `transactions.json`  all transactions
- `subscriptions.json` detected subscriptions and cancellation tags
- `anomalies.json`     flagged events
- `merchants.json`     canonical merchant registry
- `categories.json`    category registry (seed + AI additions)
- `holdings.json`      brokerage holdings snapshots (v2)
- `reports/<period>.json`   per-period structured reports

## Personal files (always under personal_path)

- `accounts.yaml`         your account registry
- `categories.yaml`       category overrides and frozen markers
- `categorization.yaml`   regex rules
- `aliases.yaml`          merchant alias overrides
- `alerts.yaml`           anomaly thresholds, mute and block lists
- `notes/`                free-form markdown notes the skill may read for context
- `overrides/`            per-account quirks

## Resolution rule

Every other doc says "the inbox" or "the DB". Always resolve via this file. Never hard-code a path elsewhere.
