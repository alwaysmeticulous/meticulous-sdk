#!/bin/bash
#
# SessionStart hook: loads context.json into Claude's context automatically.

CONTEXT_FILE="debug-data/context.json"

if [ ! -f "$CONTEXT_FILE" ]; then
  exit 0
fi

CONTENT=$(cat "$CONTEXT_FILE")

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": $(echo "$CONTENT" | jq -Rs .)
  }
}
EOF
