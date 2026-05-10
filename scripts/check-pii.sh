#!/usr/bin/env bash
# Pre-commit-friendly scanner for the public-repo PII rules in CLAUDE.md.
# Exits 0 when clean, 1 when anything matches.
#
# Run from anywhere; works from the repo root.
#
# Usage:
#   bash scripts/check-pii.sh                  # scan tracked files
#   bash scripts/check-pii.sh --staged         # scan only staged-for-commit changes
#
# Add as a git pre-commit hook:
#   ln -sf ../../scripts/check-pii.sh .git/hooks/pre-commit
#
# Design note: this script contains ONLY structural regexes that look
# like PII shapes (long digit runs in account contexts, US street
# addresses, phone numbers, ISO timestamps, etc.). It does NOT hardcode
# any specific name, last4, merchant, or address — those would leak the
# very data we're checking against.
#
# Users who want a regression net for *their own* known leaks (e.g. the
# specific account numbers that snuck into the repo earlier in dev) can
# put one regex per line at:
#
#   ~/.config/finance/pii-patterns
#
# That file is OUTSIDE the repo, gitignored by virtue of being on a
# different path, and gets read in addition to the structural patterns
# below.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Generic structural patterns. Each one looks like PII would look in
# a real text file — without naming any specific person, place, or
# product.
STRUCTURAL_PATTERNS=(
  # 7-12 digit run preceded by an account/policy/plan/tag context word.
  # Catches "Account number 1234567890", "Tag #217967555", etc.
  '(account|acct\.?|policy|plan|participant|tag|transponder|customer)[[:space:]#:]+[0-9]{7,}'
  # 4-digit "last4" called out as such, in contexts that suggest a
  # specific real card. Generic placeholders like "<last4>" or "1234"
  # in a yaml comment are fine — the pattern looks for actual digit
  # runs in card-statement context.
  'ending[[:space:]]+in[[:space:]]+[0-9]{4}\b'
  '\bcard[[:space:]]+(no|number|#)?[[:space:]:]*[0-9]{4}-?[0-9]+'
  # Phone numbers (US-shaped)
  '\(?[0-9]{3}\)?[-. ][0-9]{3}-[0-9]{4}\b'
  # Email addresses (excluding obvious docs/test/example domains).
  '[a-z0-9._%+-]+@(?!example\.|test\.|localhost)[a-z0-9.-]+\.[a-z]{2,}'
  # US street addresses (digits + capitalized word + St/Ave/Rd/...)
  '\b[0-9]{2,6}[[:space:]]+[A-Z][A-Za-z]+[[:space:]]+(St|Ave|Rd|Blvd|Dr|Ln|Way|Ct|Cir|Pkwy)\b'
  # Real-looking high-precision ISO timestamps used as JSON example
  # values. Schema docs should use placeholders like "<ISO timestamp UTC>".
  '"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z"'
  # SSN-ish formatting
  '\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b'
  # ZIP+4
  '\b[0-9]{5}-[0-9]{4}\b'
  # Specific github.com/<owner>/<repo> references in committed code/docs.
  # The public-clone instruction should use <repo-url> as a placeholder so
  # the private-fork URL doesn't leak into a public mirror.
  'github\.com/[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+\.git'
)

# Files to ignore — these contain functional brand matchers that benefit
# every user and are NOT personal hints. CLAUDE.md "Kept by design"
# section explains.
EXCLUDES=(
  ':!skill/categorization/default-rules.yaml'
  ':!examples/categorization.example.yaml'
  ':!web/frontend/src/shared/lib/aliases.ts'
  ':!web/frontend/src/shared/lib/perkIcon.tsx'
  ':!web/frontend/src/shared/lib/maps.ts'
  ':!CLAUDE.md'
  ':!scripts/check-pii.sh'
  ':!web/frontend/package-lock.json'
  ':!web/frontend/tsconfig.node.tsbuildinfo'
  ':!web/frontend/node_modules/**'
  ':!web/frontend/dist/**'
  ':!web/backend/.venv/**'
)

# Pull user-private patterns if present.
USER_PATTERNS_FILE="${HOME}/.config/finance/pii-patterns"
if [[ -f "$USER_PATTERNS_FILE" ]]; then
  while IFS= read -r line; do
    # Skip blank lines and comments.
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    STRUCTURAL_PATTERNS+=("$line")
  done < "$USER_PATTERNS_FILE"
fi

if [[ "${1:-}" == "--staged" ]]; then
  TARGETS=$(git diff --cached --name-only --diff-filter=ACM)
  if [[ -z "$TARGETS" ]]; then
    echo "no staged files — nothing to scan"
    exit 0
  fi
  SCAN_FILES=$(echo "$TARGETS" | tr '\n' ' ')
  scan_cmd() {
    local pat="$1"
    grep -niE "$pat" $SCAN_FILES 2>/dev/null \
      | grep -v 'node_modules\|\.venv/\|tsbuildinfo\|package-lock\|integrity.*sha\|github\.com' \
      || true
  }
else
  scan_cmd() {
    local pat="$1"
    git grep -niE "$pat" -- "${EXCLUDES[@]}" 2>/dev/null \
      | grep -v 'integrity.*sha\|github\.com' \
      || true
  }
fi

dirty=0
for pat in "${STRUCTURAL_PATTERNS[@]}"; do
  hits=$(scan_cmd "$pat")
  if [[ -n "$hits" ]]; then
    if [[ "$dirty" -eq 0 ]]; then
      printf '\033[31m✗\033[0m PII-shaped patterns detected:\n\n' >&2
    fi
    printf '\033[33m  pattern:\033[0m %s\n' "$pat" >&2
    printf '%s\n\n' "$hits" >&2
    dirty=1
  fi
done

if [[ "$dirty" -eq 1 ]]; then
  printf '\033[31m✗\033[0m commit blocked. See CLAUDE.md → "Redaction patterns".\n' >&2
  printf '   To bypass intentionally (e.g. issuer customer-service phone in docs),\n' >&2
  printf '   commit with \033[1m--no-verify\033[0m and explain in the commit message.\n' >&2
  exit 1
fi

printf '\033[32m✓\033[0m no PII-shaped patterns detected\n'
[[ -f "$USER_PATTERNS_FILE" ]] \
  && printf '   (private regex list at %s also applied)\n' "$USER_PATTERNS_FILE"
exit 0
