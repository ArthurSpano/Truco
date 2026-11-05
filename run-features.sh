#!/usr/bin/env bash
# Implements FEATURES.md one feature at a time: an implement pass, then a
# review pass, until every box is ticked.
#
# The script, not Claude, picks the feature and ticks its box. Both passes are
# told the exact feature by name, and the box is ticked only when the review
# pass ends with "VERDICT: DONE". So the implement pass can't mark its own work
# as done, and the review always checks the feature that was just built.
#
# Safety stops:
#   - Usage limit hit: waits LIMIT_WAIT seconds and retries, instead of firing
#     thousands of empty sessions.
#   - A feature still not ticked after MAX_TRIES implement+review cycles: stops,
#     so it never loops forever on one feature.
#   - claude exits with an error: stops.
#
# Stop the loop before editing this file: bash reads scripts as it runs them.
set -euo pipefail

LIMIT_WAIT=${LIMIT_WAIT:-1800}  # seconds to wait after hitting the usage limit
MAX_TRIES=${MAX_TRIES:-3}       # cycles per feature before giving up
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

implement_prompt() {
  cat <<EOF
Implement this feature from FEATURES.md, with tests: "$1".
Only this feature. If part of it already exists, finish it rather than starting over.
Run 'npm run check' and make it pass. Then commit.
Do not edit FEATURES.md: a separate review pass decides whether the feature is done.
EOF
}

review_prompt() {
  cat <<EOF
Review the implementation of this feature from FEATURES.md critically: "$1".
Look at the recent commits for it and any uncommitted changes. Check it against CLAUDE.md.
Fix any problems, run 'npm run check', and commit fixes. Do not edit FEATURES.md.
End your reply with exactly one of these lines:
VERDICT: DONE      (the feature is complete, tested, committed, and 'npm run check' passes)
VERDICT: NOT DONE  (anything else; say what is missing)
EOF
}

log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

unchecked() { grep -c '^- \[ \]' FEATURES.md || true; }

# Runs one claude session and stores its output in $OUT. Retries after a wait
# if the usage limit is hit.
OUT=""
run_claude() {
  local prompt=$1 status
  while true; do
    log "claude: $(head -1 <<<"$prompt")"
    status=0
    OUT=$(claude -p "$prompt" --permission-mode acceptEdits --allowedTools "${ALLOWED_TOOLS[@]}" 2>&1) || status=$?
    echo "$OUT" | tee -a "$LOG"
    if grep -qiE "hit your .*limit" <<<"$OUT"; then
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

tries=0
last_line=""
while [ "$(unchecked)" -gt 0 ]; do
  # Line number and text of the first unchecked feature.
  entry=$(grep -n -m1 '^- \[ \]' FEATURES.md)
  line=${entry%%:*}
  feature=${entry#*:- \[ \] }
  if [ "$line" = "$last_line" ]; then tries=$((tries + 1)); else tries=1; last_line=$line; fi
  if [ "$tries" -gt "$MAX_TRIES" ]; then
    log "Stopping: \"$feature\" still not done after $MAX_TRIES tries. Check $LOG."
    exit 1
  fi
  log "Feature (line $line, try $tries/$MAX_TRIES): $feature"

  run_claude "$(implement_prompt "$feature")"
  run_claude "$(review_prompt "$feature")"

  if grep -qx 'VERDICT: DONE' <<<"$(tail -5 <<<"$OUT" | tr -d '*`' | sed 's/[[:space:]]*$//')"; then
    sed -i "${line}s/^- \[ \]/- [x]/" FEATURES.md
    git add FEATURES.md
    git commit -q -m "Tick feature: $feature"
    log "Review says done, ticked. $(unchecked) features left."
  else
    log "Review says not done."
  fi
done

log "All features done."
