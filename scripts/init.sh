#!/usr/bin/env bash
set -euo pipefail

# Idempotent bootstrap for the finance project.
#
# This script lives inside the git repo at $REPO_ROOT.
# All user data lives OUTSIDE the repo, in a separate directory ($DATA_ROOT).
# Default DATA_ROOT: ~/claude-configs/finance-data
#
# What this creates under DATA_ROOT:
#   config.yaml       (paths and behavior knobs)
#   personal/         (your accounts, rules, aliases, alerts)
#   inbox/            (drop statements here; can be relocated)
#   archive/          (processed statements; can be relocated)
#   db/               (JSON state; can be relocated)
#   extracted/        (debug artifacts; can be relocated)
#
# Also: symlinks $REPO_ROOT/skill into ~/.claude/skills/finance.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_TARGET="${HOME}/.claude/skills/finance"
DEFAULT_DATA_ROOT="${HOME}/claude-configs/finance-data"

# ACCEPT_ALL toggles after the user answers the "use defaults?" prompt
# below. When 1, prompt() returns the suggested default silently. When 0,
# prompt() asks the user one question at a time.
ACCEPT_ALL=0

prompt() {
  local label="$1"
  local default="$2"
  if [[ "${ACCEPT_ALL}" -eq 1 ]]; then
    echo "  ${label}: ${default}" >&2
    echo "${default}"
    return
  fi
  local result
  read -r -p "${label} [${default}]: " result
  echo "${result:-$default}"
}

# Returns the next free finance-data-N path next to the given base.
# Used when offering a "create new" alternative to an existing dir.
next_numbered_data_root() {
  local base="$1"
  local n=2
  while [[ -d "${base}-${n}" ]]; do
    n=$((n + 1))
  done
  echo "${base}-${n}"
}

# True when the dir exists and holds REAL data (>= 1 transaction). A
# leftover config.yaml or an empty transactions.json [] doesn't count —
# those just mean a previous setup ran here, and a re-run can reuse the
# dir silently.
data_root_has_content() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then return 1; fi
  if [[ -f "${dir}/db/transactions.json" ]]; then
    local count
    count=$(python3 -c "import json,sys; print(len(json.load(open('${dir}/db/transactions.json'))))" 2>/dev/null || echo 0)
    [[ "${count:-0}" -gt 0 ]] && return 0
  fi
  return 1
}

expand_path() {
  echo "${1/#\~/$HOME}"
}

echo "Initializing finance project."
echo "Repo (committed):      ${REPO_ROOT}"
echo
echo "Your private data (statements, transaction history, account list) lives"
echo "in a separate folder OUTSIDE this repo so the repo can stay public."
echo

# ───── Step 1: settle on the data root ─────
# If saved pointer exists, use it. Otherwise default. Then if the chosen
# path already has data, ask the user explicitly: reuse it (continue from
# where they left off), create a new numbered dir (preserves existing as
# backup), or pick a custom path.

if [[ -f "${HOME}/.config/finance/data_root" ]]; then
  TARGET_DATA_ROOT="$(cat "${HOME}/.config/finance/data_root")"
else
  TARGET_DATA_ROOT="${DEFAULT_DATA_ROOT}"
fi
TARGET_DATA_ROOT="$(expand_path "${TARGET_DATA_ROOT}")"

if data_root_has_content "${TARGET_DATA_ROOT}"; then
  numbered="$(next_numbered_data_root "${TARGET_DATA_ROOT}")"
  existing_txn_count=$(python3 -c "import json,sys; print(len(json.load(open('${TARGET_DATA_ROOT}/db/transactions.json'))))" 2>/dev/null || echo 0)
  echo "${TARGET_DATA_ROOT} already exists (${existing_txn_count} transactions)."
  echo "What would you like to do?"
  echo "  1) Use it as-is — continue with the data already there"
  echo "  2) Keep it untouched, create a fresh dir at ${numbered}"
  echo "  3) Choose a custom path"
  read -r -p "Choice [1/2/3, default 2]: " choice
  case "${choice}" in
    1) DATA_ROOT="${TARGET_DATA_ROOT}" ;;
    3) read -r -p "Custom path: " custom; DATA_ROOT="$(expand_path "${custom:-$numbered}")" ;;
    ""|2|*) DATA_ROOT="${numbered}" ;;
  esac
  echo
else
  DATA_ROOT="${TARGET_DATA_ROOT}"
fi

# Final guard: if the picked path STILL has data (e.g., user typed a custom
# path that points at a populated dir), require an explicit YES.
if data_root_has_content "${DATA_ROOT}"; then
  existing_count=$(python3 -c "import json,sys; print(len(json.load(open('${DATA_ROOT}/db/transactions.json'))))" 2>/dev/null || echo 0)
  if [[ "${existing_count:-0}" -gt 0 ]]; then
    echo "WARNING: ${DATA_ROOT} already contains ${existing_count} transactions."
    echo "Type YES to use it as-is, or anything else to abort."
    read -r -p "Use ${DATA_ROOT}? [YES/NO]: " confirm
    if [[ "${confirm}" != "YES" ]]; then
      echo "Aborted. No changes made."
      exit 1
    fi
  fi
fi

mkdir -p "${HOME}/.config/finance"
echo "${DATA_ROOT}" > "${HOME}/.config/finance/data_root"

# ───── Step 2: show defaults summary, ask Y/n for the rest ─────

DEFAULT_INBOX="${DATA_ROOT}/inbox"
DEFAULT_ARCHIVE="${DATA_ROOT}/archive"
DEFAULT_DB="${DATA_ROOT}/db"
DEFAULT_EXTRACTED="${DATA_ROOT}/extracted"

CONFIG_FILE="${DATA_ROOT}/config.yaml"
SKIP_CONFIG=0

# If we're reusing a config.yaml from an earlier run, no point re-asking.
if [[ -f "${CONFIG_FILE}" ]]; then
  echo "Existing config found at ${CONFIG_FILE}. Reusing its paths."
  INBOX_PATH=$(grep -E '^inbox_path:'     "${CONFIG_FILE}" | awk '{print $2}' | tr -d '"')
  ARCHIVE_PATH=$(grep -E '^archive_path:' "${CONFIG_FILE}" | awk '{print $2}' | tr -d '"')
  DB_PATH=$(grep -E '^db_path:'           "${CONFIG_FILE}" | awk '{print $2}' | tr -d '"')
  EXTRACTED_PATH=$(grep -E '^extracted_path:' "${CONFIG_FILE}" | awk '{print $2}' | tr -d '"')
  SKIP_CONFIG=1
else
  echo
  echo "Defaults:"
  echo "  Data folder:      ${DATA_ROOT}"
  echo "  Inbox:            ${DEFAULT_INBOX}"
  echo "  Archive:          ${DEFAULT_ARCHIVE}"
  echo "  DB:               ${DEFAULT_DB}"
  echo "  Extracted:        ${DEFAULT_EXTRACTED}"
  echo
  read -r -p "Use these defaults? [Y/n]: " yn
  if [[ "${yn}" == "" || "${yn}" == "y" || "${yn}" == "Y" ]]; then
    ACCEPT_ALL=1
    echo "  Accepted."
  else
    echo "  Walking through each prompt — press Enter to accept the suggested default."
  fi
  echo

  INBOX_PATH=$(prompt     "Where should statements be dropped?"            "${DEFAULT_INBOX}")
  ARCHIVE_PATH=$(prompt   "Where should processed statements be archived?" "${DEFAULT_ARCHIVE}")
  DB_PATH=$(prompt        "Where should the JSON DB live?"                  "${DEFAULT_DB}")
  EXTRACTED_PATH=$(prompt "Where should per-statement extraction artifacts go?" "${DEFAULT_EXTRACTED}")
fi

INBOX_PATH=$(expand_path "${INBOX_PATH}")
ARCHIVE_PATH=$(expand_path "${ARCHIVE_PATH}")
DB_PATH=$(expand_path "${DB_PATH}")
EXTRACTED_PATH=$(expand_path "${EXTRACTED_PATH}")

mkdir -p "${DATA_ROOT}"
mkdir -p "${INBOX_PATH}" "${ARCHIVE_PATH}" "${DB_PATH}" "${EXTRACTED_PATH}"
mkdir -p "${DATA_ROOT}/personal/notes" "${DATA_ROOT}/personal/overrides"
mkdir -p "${DB_PATH}/reports"

# Seed personal/ from examples if not present (never overwrite existing).
# Skip config.example.yaml; that is for the data-root config.yaml, not personal/.
for ex in "${REPO_ROOT}"/examples/*.example.yaml; do
  fname=$(basename "${ex}")
  if [[ "${fname}" == "config.example.yaml" ]]; then
    continue
  fi
  target_name="${fname%.example.yaml}.yaml"
  target="${DATA_ROOT}/personal/${target_name}"
  if [[ ! -f "${target}" ]]; then
    cp "${ex}" "${target}"
    echo "Seeded personal/${target_name}"
  fi
done

# Initialize empty DB files if missing
init_json() {
  local f="$1"
  local default="$2"
  if [[ ! -f "${f}" ]]; then
    echo "${default}" > "${f}"
    echo "Initialized $(basename "${f}")"
  fi
}

init_json "${DB_PATH}/processed.json"     "{}"
init_json "${DB_PATH}/statements.json"    "[]"
init_json "${DB_PATH}/transactions.json"  "[]"
init_json "${DB_PATH}/subscriptions.json" "[]"
init_json "${DB_PATH}/anomalies.json"     "[]"
init_json "${DB_PATH}/merchants.json"     "[]"
init_json "${DB_PATH}/holdings.json"      "[]"
init_json "${DB_PATH}/categories.json"    "[]"

# Symlink the skill so Claude Code discovers it
mkdir -p "${HOME}/.claude/skills"
if [[ -L "${SKILL_TARGET}" ]]; then
  current=$(readlink "${SKILL_TARGET}")
  if [[ "${current}" != "${REPO_ROOT}/skill" ]]; then
    echo "Updating skill symlink: ${SKILL_TARGET} -> ${REPO_ROOT}/skill"
    ln -sfn "${REPO_ROOT}/skill" "${SKILL_TARGET}"
  fi
elif [[ -e "${SKILL_TARGET}" ]]; then
  echo "Warning: ${SKILL_TARGET} exists and is not a symlink. Leaving it alone."
else
  ln -sfn "${REPO_ROOT}/skill" "${SKILL_TARGET}"
  echo "Linked skill into ~/.claude/skills/finance"
fi

# Write config.yaml unless skipped. Lives in DATA_ROOT, not in the repo.
if [[ "${SKIP_CONFIG:-0}" -eq 0 ]]; then
  cat > "${CONFIG_FILE}" <<EOF
# Generated by scripts/init.sh. Edit freely; re-run init to regenerate.
data_root: "${DATA_ROOT}"
repo_root: "${REPO_ROOT}"
inbox_path: "${INBOX_PATH}"
archive_path: "${ARCHIVE_PATH}"
db_path: "${DB_PATH}"
extracted_path: "${EXTRACTED_PATH}"
personal_path: "${DATA_ROOT}/personal"
skill_path: "${REPO_ROOT}/skill"

# Behavior knobs
large_txn_threshold: 500
recent_price_increase_pct: 15
foreign_txn_flag: true
retention:
  delete_archive_after_days: 0   # 0 = never delete
EOF
  echo "Wrote ${CONFIG_FILE}"
fi

echo
echo "Done."
echo
echo "Layout:"
echo "  Repo (committed): ${REPO_ROOT}"
echo "  Data (private):   ${DATA_ROOT}"
echo
echo "Next steps:"
echo "  1. Drop a statement (PDF or CSV) into: ${INBOX_PATH}"
echo "  2. Open Claude Code and invoke the finance skill."
echo "  3. Edit ${DATA_ROOT}/personal/*.yaml to customize categories, aliases, alerts."
