#!/usr/bin/env bash
# Stop and remove the launchd agents installed by setup.sh. Leaves the
# data directory, the repo, and Python venvs untouched — pure undo of
# the "register the daemons" step.

set -euo pipefail

UID_NUM="$(id -u)"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"

for label in com.myfainance.backend com.myfainance.inbox-watch; do
  if launchctl print "gui/${UID_NUM}/${label}" >/dev/null 2>&1; then
    launchctl bootout "gui/${UID_NUM}/${label}" 2>/dev/null || true
    echo "stopped: $label"
  fi
  rm -f "${LAUNCH_AGENTS_DIR}/${label}.plist"
done

echo
echo "Done. Data and code are untouched. To remove the data too:"
echo "  rm -rf $(cat ~/.config/finance/data_root 2>/dev/null || echo '~/claude-configs/finance-data')"
