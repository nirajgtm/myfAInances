# Finance

Local-first personal finance tracking. Drop statements into an inbox, the
ingest pipeline parses them with an LLM, dedupes, categorizes, detects
subscriptions and anomalies, and serves a dashboard at `127.0.0.1:8000`.

Nothing leaves your machine. No third-party aggregators. PDFs, CSVs, and
HTML page-saves are supported.

## Two-directory layout

This repo holds skill prose, scripts, examples, and the dashboard code.
**All personal data lives in a separate directory outside the repo** so
the repo can stay public:

```
~/claude-configs/
  finance/                 # this repo (committed, no PII)
    skill/                 # Claude Code skill (symlinked into ~/.claude/skills/finance)
    scripts/               # setup, ingest, parser, daemons
    web/                   # FastAPI backend + React PWA
    examples/              # redacted starter configs
    README.md

  finance-data/            # NOT in the repo, never committed (default location)
    config.yaml            # paths + behavior knobs
    personal/              # accounts.yaml, aliases, alerts, overrides, notes
    inbox/                 # drop statements here
    archive/               # processed statements (optional)
    db/                    # JSON state (transactions, subscriptions, anomalies, reports)
    extracted/             # debug artifacts
```

The data directory location is your choice. Default
`~/claude-configs/finance-data/` — `init.sh` asks during setup.

## Setup — one command

```sh
git clone <repo-url> ~/claude-configs/finance
cd ~/claude-configs/finance
bash scripts/setup.sh
```

`setup.sh` is idempotent. It:

1. Verifies prerequisites (`python3` ≥ 3.9, `node`, `npm`, `claude` CLI).
2. Runs `scripts/init.sh` to create the data directory, seed
   `personal/*.yaml` from examples, and symlink the Claude Code skill.
3. Installs script-side Python deps (`pyyaml`, `pypdf`).
4. Creates `web/backend/.venv` and installs FastAPI + uvicorn.
5. Runs `npm install && vite build` for the frontend.
6. Installs two macOS launchd agents that run in the background:
   - `com.myfainance.backend` — uvicorn at `http://127.0.0.1:8000/`.
   - `com.myfainance.inbox-watch` — runs `scripts/ingest.py` every
     6 hours (and once at load) so anything new in the inbox gets
     picked up without you doing anything.
7. Prints the dashboard URL and where to drop statements.

After setup, drop a PDF / CSV / HTML into `<data_root>/inbox/` whenever
you want. Within 6 hours (or sooner if you run `python3 scripts/ingest.py`
manually) the LLM extracts it, dedup runs, transactions are categorized,
subscriptions are re-detected, and the dashboard reflects the new state
on its 8-second auto-poll. No CLI interaction needed.

### Prerequisites

- macOS (the launchd agents are macOS-specific; Linux support is
  straightforward to add via systemd user units — open an issue).
- Python 3.9+
- Node + npm
- Claude Code CLI, authenticated. The parser shells out to `claude -p`
  using your local subscription — no API key is configured here.

### Stop / restart / uninstall

```sh
# stop everything (data preserved)
bash scripts/uninstall.sh

# restart just the backend after a code change
launchctl kickstart -k gui/$(id -u)/com.myfainance.backend

# manual ingest (rarely needed — watcher handles it)
python3 scripts/ingest.py
```

## How statements flow

```
inbox/foo.pdf
   │
   ▼  (launchd timer, every 6h)
scripts/inbox-watcher.sh  →  scripts/ingest.py
   │
   ├── 3-layer dedup (file hash → statement key → txn key)
   ├── parser.py calls Claude CLI to extract a JSON envelope
   ├── auto-categorize uncategorized txns
   ├── detect subscriptions (heuristic + LLM filter + user overrides)
   ├── canonicalize merchants
   └── write db/*.json
                              │
                              ▼
                        FastAPI (web/backend) → PWA at :8000
                          • Home (insights, upcoming payments)
                          • Activity (search, maps, drill-in)
                          • Spending (categories | insights | subs)
                          • Wealth (net worth, retirement, taxes, holdings)
                          • Cards (utilization, perks)
```

## Where the skill looks for config

In order:

1. `$FINANCE_CONFIG` env var if set (the launchd agents set this).
2. `~/.config/finance/data_root` (one-line file with the data root
   path; `init.sh` writes this).
3. Fallback: `~/claude-configs/finance-data/config.yaml`.

If none of these resolve, the skill instructs you to run
`bash scripts/setup.sh`.

## Adding a new institution

The first time the LLM sees a new bank or card, the parser auto-creates an
account stub in `<data_root>/personal/accounts.yaml` and writes any
extraction quirks it learned to `skill/institutions/<slug>.md`. Quirks
files contain only generalizable observations — no account numbers, no
real merchant histories.

## Skill docs

Entry: `skill/SKILL.md`. Everything else reachable from there.
