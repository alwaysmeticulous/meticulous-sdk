#!/bin/bash
#
# PreToolUse hook for the Read tool. Warns Claude when a file is large
# so it considers using Grep or reading specific line ranges instead.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# macOS stat uses -f%z, Linux uses -c%s
SIZE=$(stat -f%z "$FILE_PATH" 2>/dev/null || stat -c%s "$FILE_PATH" 2>/dev/null)

if [ -z "$SIZE" ]; then
  exit 0
fi

THRESHOLD=500000

if [ "$SIZE" -gt "$THRESHOLD" ]; then
  SIZE_KB=$((SIZE / 1024))
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "This file is ${SIZE_KB}KB. Consider using the summarizer subagent to get an overview, using Grep to search for specific content, or reading a specific line range. Check fileMetadata in context.json for line counts."
  }
}
EOF
fi
