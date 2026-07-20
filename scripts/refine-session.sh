#!/usr/bin/env bash
# Kick off a refine job for one session, poll until done, then print cached refined lessons.
# Usage: scripts/refine-session.sh <sessionId>
# Example: scripts/refine-session.sh 79de3fd8-33cd-493f-a91f-2b4cc334151d

set -euo pipefail

SID="${1:-}"
if [[ -z "$SID" ]]; then
  echo "Usage: $0 <sessionId>" >&2
  exit 2
fi

PORT="${GOGOAGENT_PORT:-43111}"
BASE="${GOGOAGENT_BASE:-http://127.0.0.1:${PORT}}"
TOKEN_FILE="${GOGOAGENT_AUTH_TOKEN_FILE:-$HOME/.gogoagent/sidecar-${PORT}.token}"
if [[ ! -r "$TOKEN_FILE" ]]; then
  echo "Cannot read the sidecar token at $TOKEN_FILE. Start gogoagent first or set GOGOAGENT_AUTH_TOKEN_FILE." >&2
  exit 1
fi
TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE")"
if [[ -z "$TOKEN" ]]; then
  echo "The sidecar token file is empty: $TOKEN_FILE" >&2
  exit 1
fi
AUTH_HEADER=( -H "authorization: Bearer $TOKEN" )
PAYLOAD="$(jq -cn --arg sid "$SID" '{sessionIds: [$sid]}')"

JOB=$(curl -fsS -X POST "$BASE/lessons/refine" \
  "${AUTH_HEADER[@]}" \
  -H 'content-type: application/json' \
  -d "$PAYLOAD" | jq -er .jobId)

echo "job=$JOB"

while :; do
  S=$(curl -fsS "${AUTH_HEADER[@]}" "$BASE/lessons/refine/status/$JOB")
  echo "$S" | jq -c '{state,processed,total,skipped,errors}'
  STATE=$(echo "$S" | jq -r .state)
  case "$STATE" in
    done|error) break ;;
  esac
  sleep 2
done

echo "--- refined lessons ---"
curl -fsS "${AUTH_HEADER[@]}" --get --data-urlencode "sessionId=$SID" "$BASE/lessons/refined" | jq
