#!/usr/bin/env bash
# One-shot bootstrap for the finance project.
#
# Run from a fresh clone:
#   git clone <repo-url> ~/claude-configs/finance
#   cd ~/claude-configs/finance && bash scripts/setup.sh
#
# Idempotent. Safe to re-run any time.
#
# What it does (in order):
#   1. Verify prerequisites (python3, node, npm, claude CLI). Refuse to
#      continue if anything mandatory is missing.
#   2. Run scripts/init.sh to create the data dir, seed configs, link the
#      Claude Code skill.
#   3. pip-install the script-side Python deps (pyyaml, pypdf).
#   4. Create web/backend/.venv and install FastAPI / uvicorn / etc.
#   5. npm install + vite build the frontend so the backend can serve it.
#   6. Install two launchd agents that run forever in the background:
#        - com.myfainance.backend     → uvicorn on 127.0.0.1:8000
#        - com.myfainance.inbox-watch → ingest.py whenever inbox/ changes
#   7. Print the URL to open and quick-reference commands.
#
# macOS only for now (uses launchd). On Linux this would use systemd
# user services; happy to add when needed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCH_AGENTS_DIR="${HOME}/Library/LaunchAgents"
DESIRED_PORT="${PORT:-8000}"
LOG_DIR="${HOME}/.cache/finance/logs"

# Stop any prior finance backend before port detection so we don't
# auto-bump to 8001 just because the previous run is still holding 8000.
if launchctl list "com.myfainance.backend" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/com.myfainance.backend" 2>/dev/null || true
  sleep 1
fi

# Pick a free port starting from DESIRED_PORT and bumping by 1. Skips
# anything occupied (LISTEN socket on that port). Cap at +20 to avoid
# infinite loops on a hopelessly-busy machine.
find_free_port() {
  local start="$1"
  local p
  for ((p = start; p < start + 20; p++)); do
    if ! lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

if ! PORT="$(find_free_port "$DESIRED_PORT")"; then
  printf '\033[31m✗\033[0m no free port found in %d..%d — close something on those ports and retry\n' "$DESIRED_PORT" "$((DESIRED_PORT + 19))" >&2
  exit 1
fi

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<USAGE
Usage: bash scripts/setup.sh

Bootstraps the finance project end-to-end on macOS. Idempotent.
Prompts at the start with all defaults; you choose accept-all or
walk-through-each. Re-run any time.
USAGE
  exit 0
fi

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
dim()  { printf '  \033[2m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1" >&2; }

# OS gate — launchd-specific so far.
if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "This installer is macOS-only (uses launchd). Linux/WSL users:"
  fail "  Open an issue or run scripts/ingest.py manually + uvicorn in a tmux pane."
  exit 1
fi

cat <<'BANNER'

  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │   MyfAInance — local-first personal finance                      │
  │                                                                  │
  │   This installer will:                                           │
  │     1. Verify python3 / node / npm / claude CLI are installed    │
  │     2. Create your private data directory (default               │
  │        ~/claude-configs/finance-data/)                           │
  │     3. Set up the backend Python venv + frontend bundle          │
  │     4. Register two background agents:                           │
  │          • backend at http://127.0.0.1:8000/                     │
  │          • inbox processor that runs every 6 hours               │
  │     Once it finishes, drop statements via the dashboard          │
  │     dropzone — no terminal needed.                               │
  │                                                                  │
  │   Idempotent. Safe to re-run any time.                           │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘

BANNER

if [[ "$PORT" != "$DESIRED_PORT" ]]; then
  printf '\033[33m!\033[0m Port %s is in use; using %s instead.\n\n' "$DESIRED_PORT" "$PORT"
fi

bold "[1/7] Verifying prerequisites"

require_cmd() {
  local cmd="$1"
  local hint="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    fail "missing: $cmd"
    printf '       install: %s\n' "$hint" >&2
    return 1
  fi
  ok "$cmd: $($cmd --version 2>&1 | head -1)"
}

missing=0
require_cmd python3 "https://www.python.org/downloads/ — need 3.9+"   || missing=1
require_cmd node    "https://nodejs.org/ or 'brew install node'"      || missing=1
require_cmd npm     "ships with node — install node first"            || missing=1
require_cmd claude  "Claude Code: https://docs.anthropic.com/claude-code" || missing=1
if [[ "$missing" -eq 1 ]]; then
  fail "Install the missing tools above and re-run scripts/setup.sh."
  exit 1
fi

# Python version sanity (>= 3.9)
PY_OK=$(python3 -c 'import sys; print(1 if sys.version_info >= (3, 9) else 0)')
if [[ "$PY_OK" != "1" ]]; then
  fail "python3 must be >= 3.9 (got $(python3 --version))"
  exit 1
fi
ok "python3 version OK"

# Claude Code authentication probe. We just verified `claude` is on PATH;
# now confirm it can actually round-trip with the LLM. Unauthenticated
# installs would otherwise pass setup, then fail noisily on the first
# ingest with "Invalid API key" or similar from the parser subprocess.
dim "Checking Claude Code authentication (one-time, takes ~5s)..."
if probe_out=$(claude -p "ok" --output-format json --allowedTools "" 2>&1) \
    && echo "$probe_out" | grep -q '"result"'; then
  ok "claude authenticated"
else
  fail "Claude Code is installed but not authenticated."
  echo
  echo "  To authenticate, run this in another terminal:"
  echo
  printf "    \033[1mclaude\033[0m\n"
  echo
  echo "  It'll open a browser, you sign in, then quit the REPL with /exit"
  echo "  (or Ctrl-C). After that, re-run:"
  echo
  printf "    \033[1mbash scripts/setup.sh\033[0m\n"
  echo
  exit 1
fi

bold "[2/7] Bootstrapping data directory + skill symlink"
dim  "Your data lives outside this repo so the repo stays public and shareable."
dim  "You'll be asked where it should go — accept the default unless you have a reason."
echo
bash "${REPO_ROOT}/scripts/init.sh"

# Read DATA_ROOT that init.sh just wrote
DATA_ROOT="$(cat "${HOME}/.config/finance/data_root")"
CONFIG_FILE="${DATA_ROOT}/config.yaml"
ok "data_root: $DATA_ROOT"

bold "[3/7] Installing script-side Python deps"
dim  "These power scripts/ingest.py (pyyaml, pypdf). Installed to your user site-packages."
SCRIPT_PYTHON="${SCRIPT_PYTHON:-python3}"
"$SCRIPT_PYTHON" -m pip install --user --quiet --upgrade pip 2>/dev/null || true
"$SCRIPT_PYTHON" -m pip install --user --quiet -r "${REPO_ROOT}/scripts/requirements.txt"
ok "scripts/requirements.txt installed"

bold "[4/7] Setting up backend virtualenv"
dim  "Isolated venv for the FastAPI server so it doesn't conflict with system Python."
BACKEND_DIR="${REPO_ROOT}/web/backend"
BACKEND_VENV="${BACKEND_DIR}/.venv"
if [[ ! -d "$BACKEND_VENV" ]]; then
  python3 -m venv "$BACKEND_VENV"
  ok "created $BACKEND_VENV"
fi
"$BACKEND_VENV/bin/pip" install --quiet --upgrade pip
"$BACKEND_VENV/bin/pip" install --quiet -r "${BACKEND_DIR}/requirements.txt"
ok "backend deps installed"

bold "[5/7] Building frontend bundle"
dim  "Vite compiles the React PWA to web/frontend/dist/ — served by the backend at /."
FRONTEND_DIR="${REPO_ROOT}/web/frontend"
pushd "$FRONTEND_DIR" >/dev/null
if [[ ! -d node_modules ]]; then
  npm install --no-audit --no-fund --silent
  ok "npm install complete"
fi
npm run build --silent
popd >/dev/null
ok "vite build complete"

bold "[6/7] Installing launchd agents"
dim  "macOS background services that survive logout/reboot. You can stop them"
dim  "any time with scripts/uninstall.sh."
mkdir -p "$LAUNCH_AGENTS_DIR" "$LOG_DIR"

# Substitute placeholders in the plist templates.
PLIST_BACKEND_SRC="${REPO_ROOT}/scripts/launchd/com.myfainance.backend.plist"
PLIST_WATCHER_SRC="${REPO_ROOT}/scripts/launchd/com.myfainance.inbox-watch.plist"
PLIST_BACKEND_DST="${LAUNCH_AGENTS_DIR}/com.myfainance.backend.plist"
PLIST_WATCHER_DST="${LAUNCH_AGENTS_DIR}/com.myfainance.inbox-watch.plist"

# Discover where the user's interactive shell finds `claude` so the
# launchd-spawned uvicorn (and the ingest subprocess it forks) can find
# it too. launchd's default PATH is /usr/bin:/bin:/usr/sbin:/sbin which
# misses /opt/homebrew/bin and ~/.local/bin where Claude Code commonly
# installs.
CLAUDE_BIN_PATH="$(dirname "$(command -v claude)")"
RUNTIME_PATH="${CLAUDE_BIN_PATH}:${HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${REPO_ROOT}/web/backend/.venv/bin"

render_plist() {
  local src="$1" dst="$2"
  sed \
    -e "s|@@REPO_ROOT@@|${REPO_ROOT}|g" \
    -e "s|@@DATA_ROOT@@|${DATA_ROOT}|g" \
    -e "s|@@LOG_DIR@@|${LOG_DIR}|g" \
    -e "s|@@PORT@@|${PORT}|g" \
    -e "s|@@RUNTIME_PATH@@|${RUNTIME_PATH}|g" \
    "$src" > "$dst"
}

render_plist "$PLIST_BACKEND_SRC" "$PLIST_BACKEND_DST"
render_plist "$PLIST_WATCHER_SRC" "$PLIST_WATCHER_DST"
ok "wrote $PLIST_BACKEND_DST"
ok "wrote $PLIST_WATCHER_DST"

# (Re)load each agent. The macOS launchd API has two flavors:
# - modern: launchctl bootout / bootstrap
# - legacy: launchctl unload / load
# Both can fail silently in different ways (stale registration, throttle,
# permissions). Strategy here:
#   1. Try modern bootout (no error if not loaded).
#   2. Fall back to legacy unload (no error if not loaded).
#   3. Try modern bootstrap; if that fails, fall back to legacy load.
#   4. Verify the agent is actually registered after; if not, error loud.
load_agent() {
  local plist="$1"
  local label="$2"
  local svc="gui/$(id -u)/${label}"

  # Stop any existing registration. Both forms tolerate "not loaded".
  launchctl bootout "$svc" 2>/dev/null || true
  launchctl unload "$plist" 2>/dev/null || true

  # Brief pause so launchd's bookkeeping settles before re-registering;
  # without this, a rapid bootout→bootstrap can race and the second call
  # silently no-ops.
  sleep 1

  # Try modern API first; on any failure (incl. partial-load states), fall
  # back to the legacy API, which is more forgiving.
  if ! launchctl bootstrap "gui/$(id -u)" "$plist" 2>/dev/null; then
    launchctl load "$plist" 2>/dev/null || true
  fi
  launchctl enable "$svc" 2>/dev/null || true

  # Verify. launchctl list with the label arg is the cheapest health check.
  if ! launchctl list "$label" >/dev/null 2>&1; then
    fail "agent failed to load: $label"
    fail "  try: launchctl load $plist"
    return 1
  fi
}

load_agent "$PLIST_BACKEND_DST" "com.myfainance.backend" || true
ok "backend agent loaded (com.myfainance.backend)"
load_agent "$PLIST_WATCHER_DST" "com.myfainance.inbox-watch" || true
ok "inbox watcher loaded (com.myfainance.inbox-watch)"

# Wait for the backend to come up. The first launch after a fresh venv
# build is the slowest case (cold imports of fastapi + pydantic + ours
# can take 20-40s); steady-state restarts are sub-second. Probe every
# 0.5s for 90s total.
backend_up=0
PROBE_BUDGET=180  # 0.5s × 180 = 90s
for ((i=1; i<=PROBE_BUDGET; i++)); do
  if curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/api/state" 2>/dev/null | grep -q "^200$"; then
    backend_up=1
    elapsed=$(awk "BEGIN{printf \"%.1f\", $i * 0.5}")
    break
  fi
  sleep 0.5
done

if [[ "$backend_up" -eq 1 ]]; then
  ok "backend reachable at http://127.0.0.1:${PORT}/ (took ${elapsed}s)"
else
  warn "backend didn't answer at http://127.0.0.1:${PORT}/api/state within 90s"
  warn "  the agent may still be starting — opening browser anyway, refresh if needed"
  warn "  or check: tail -f ${LOG_DIR}/backend.log"
fi

bold "[7/7] Done"

# ANSI escapes need to be interpolated, not literal — heredoc would
# print them verbatim, so use `printf` with %b conversion instead.
B=$(printf '\033[1m')   # bold
R=$(printf '\033[0m')   # reset

cat <<EOF

  ┌──────────────────────────────────────────────────────────────────┐
  │   You're set up. Here's what to do next.                         │
  └──────────────────────────────────────────────────────────────────┘

  1. Open the dashboard
       ${B}http://127.0.0.1:${PORT}/${R}

  2. Add your first statement
       Easiest: drag a PDF / CSV / HTML file onto the dropzone on the
       Home tab. It uploads, runs the LLM extractor, and refreshes the
       dashboard in place.

       Alternative: cp the file into ${DATA_ROOT}/inbox/
       The 6-hour scheduled ingest will pick it up; or run
       \`python3 ${REPO_ROOT}/scripts/ingest.py\` to trigger it now.

  3. Edit accounts as needed
       Tap the pencil icon on any account's detail sheet to set a
       nickname, override the login URL, or add free-form notes.

  ─── Useful commands ──────────────────────────────────────────────

  Watch live logs:
    tail -f ${LOG_DIR}/backend.log
    tail -f ${LOG_DIR}/inbox-watch.log

  Force an ingest right now:
    python3 ${REPO_ROOT}/scripts/ingest.py

  Restart the backend after a code change:
    launchctl kickstart -k gui/$(id -u)/com.myfainance.backend

  Stop both background agents (data preserved):
    bash ${REPO_ROOT}/scripts/uninstall.sh

EOF

# Open the dashboard automatically. We open the browser even if the
# probe didn't pass — the backend may come up a few seconds later and
# the tab will still load on the first refresh. The previous behavior
# (skip on probe miss) left users staring at a never-opened browser.
if command -v open >/dev/null 2>&1; then
  if open "http://127.0.0.1:${PORT}/"; then
    if [[ "$backend_up" -eq 1 ]]; then
      ok "opened http://127.0.0.1:${PORT}/ in your default browser"
    else
      ok "opened http://127.0.0.1:${PORT}/ — refresh the tab if it's still loading"
    fi
  else
    warn "couldn't auto-open the browser; visit http://127.0.0.1:${PORT}/ manually"
  fi
else
  warn "'open' command not found — visit http://127.0.0.1:${PORT}/ manually"
fi
