#!/usr/bin/env bash
# Periodic ingest pass. Invoked by launchd every 6 hours (and once at
# agent load). Walks the inbox, dedupes, parses anything new with the
# LLM, and writes to db/. Stdout/stderr captured by launchd into
# ~/.cache/finance/logs/inbox-watch.log.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:?REPO_ROOT not set}"

echo
echo "[inbox-watcher] $(date -Iseconds) — running ingest"
cd "$REPO_ROOT"
python3 scripts/ingest.py
echo "[inbox-watcher] $(date -Iseconds) — ingest done"
