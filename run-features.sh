#!/usr/bin/env bash
# Implements FEATURES.md one feature at a time: an implement pass, then a
# review pass, until every box is ticked.
#
# Safety stops:
#   - Usage limit hit: waits LIMIT_WAIT seconds and retries, instead of firing
#     thousands of empty sessions.
#   - No progress (no new commit and no newly ticked box) for MAX_STALLS cycles
#     in a row: stops, so it never loops forever on one feature.
#   - claude exits with an error: stops.
set -euo pipefail

LIMIT_WAIT=${LIMIT_WAIT:-1800}  # seconds to wait after hitting the usage limit
MAX_STALLS=${MAX_STALLS:-2}     # cycles without progress before giving up
PAUSE=${PAUSE:-5}               # seconds between sessions

LOG_DIR=logs
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/run-$(date +%Y%m%d-%H%M%S).log"

# acceptEdits only allows file edits. Without these, every npm and git commit
# call is refused, so nothing can be tested or committed.
ALLOWED_TOOLS=(
  "Bash(npm run *)"
  "Bash(npm test *)"
  "Bash(npx vitest *)"
  "Bash(npx tsc *)"
  "Bash(npx eslint *)"
  "Bash(npx prettier *)"
  "Bash(git add *)"
  "Bash(git commit *)"
  "Bash(git status *)"
  "Bash(git diff *)"
  "Bash(git log *)"
  "Bash(git show *)"
)

IMPLEMENT_PROMPT="Read FEATURES.md. Implement the FIRST unchecked feature only, with tests. \
Run 'npm run check' and make it pass. Then commit."

REVIEW_PROMPT="Review the work for the FIRST unchecked feature in FEATURES.md (the last commit \
and any uncommitted changes) critically. Fix any problems, run 'npm run check', and commit fixes. \
Only if 'npm run check' passes and the feature is complete, tick its box in FEATURES.md and commit that."

log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

unchecked() { grep -c '^- \[ \]' FEATURES.md || true; }

# Runs one claude session. Retries after a wait if the usage limit is hit.
run_claude() {
  local prompt=$1 out
  while true; do
    log "claude: ${prompt:0:60}..."
    local status=0
    out=$(claude -p "$prompt" --permission-mode acceptEdits --allowedTools "${ALLOWED_TOOLS[@]}" 2>&1) || status=$?
    echo "$out" | tee -a "$LOG"
    if grep -qiE "hit your .*limit" <<<"$out"; then
      log "Usage limit hit, waiting ${LIMIT_WAIT}s before retrying."
      sleep "$LIMIT_WAIT"
      continue
    fi
    if [ "$status" -ne 0 ]; then
      log "claude exited with status $status, stopping."
      exit 1
    fi
    sleep "$PAUSE"
    return
  done
}

stalls=0
while [ "$(unchecked)" -gt 0 ]; do
  before_head=$(git rev-parse HEAD)
  before_left=$(unchecked)

  run_claude "$IMPLEMENT_PROMPT"
  run_claude "$REVIEW_PROMPT"

  if [ "$(git rev-parse HEAD)" = "$before_head" ] && [ "$(unchecked)" -ge "$before_left" ]; then
    stalls=$((stalls + 1))
    log "No new commit and no box ticked ($stalls/$MAX_STALLS)."
    if [ "$stalls" -ge "$MAX_STALLS" ]; then
      log "Stopping: no progress. Check $LOG."
      exit 1
    fi
  else
    stalls=0
    log "Progress: $(unchecked) features left."
  fi
done

log "All features done."
