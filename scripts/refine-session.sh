#!/usr/bin/env bash
# Kick off a refine job for one session, poll until done, then print cached refined lessons.
# Usage: scripts/refine-session.sh <sessionId>
# Example: scripts/refine-session.sh 79de3fd8-33cd-493f-a91f-2b4cc334151d

set -euo pipefail

SID="${1:-ad7e03c0-b791-408c-a6c4-c7053241a340}"
BASE="${GOGOAGENT_BASE:-http://127.0.0.1:43111}"

JOB=$(curl -sS -X POST "$BASE/lessons/refine" \
  -H 'content-type: application/json' \
  -d "{\"sessionIds\":[\"$SID\"]}" | jq -r .jobId)

echo "job=$JOB"

while :; do
  S=$(curl -sS "$BASE/lessons/refine/status/$JOB")
  echo "$S" | jq -c '{state,processed,total,skipped,errors}'
  STATE=$(echo "$S" | jq -r .state)
  case "$STATE" in
    done|error) break ;;
  esac
  sleep 2
done

echo "--- refined lessons ---"
curl -sS "$BASE/lessons/refined?sessionId=$SID" | jq
