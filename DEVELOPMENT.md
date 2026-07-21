# Hacking on gogoagent

Day-to-day commands for running, poking, and debugging the app.
See `README.md` for what gogoagent *is*.

## Run the app (dev)

From the repo root:

```bash
./start.sh
```

That script:

1. Builds `@gogoagent/shared` and `@gogoagent/desktop`.
2. Reuses a healthy sidecar on the selected port, or starts one without file watching.
3. Launches Electron pointed at the built renderer.

Pressing Ctrl+C stops Electron and any sidecar started by that launcher. A
reused sidecar stays running. Closing Electron can also leave the sidecar
running so live terminal sessions survive app window restarts.

To force a fresh, hot-reloading sidecar during sidecar development:

```bash
GOGOAGENT_PORT=43112 GOGOAGENT_WATCH_SIDECAR=1 ./start.sh
```

The launcher never selects another port implicitly: a different port means a
different sidecar and a different set of live PTYs. Stop the existing sidecar
first if you want to replace it, or explicitly choose an unused port as above
when you intentionally want both processes.

## Build / typecheck everything

```bash
corepack pnpm -r typecheck        # type-only check across all workspaces
corepack pnpm -r build            # full build (shared, desktop, sidecar)
corepack pnpm --filter @gogoagent/sidecar build   # just sidecar
corepack pnpm test:launcher-port  # confirm occupied ports fail explicitly
```

## Privacy-safe README screenshots

```bash
corepack pnpm screenshots:demo
```

This builds the app and captures `docs/screenshots/overview.png` and
`docs/screenshots/launcher.png` from an isolated temporary home containing
only synthetic repositories and transcripts. A fake local `claude` executable
waits at a fictional choice prompt so the capture includes the real terminal
attention state without invoking Claude or using an account. The script does
not read the current user's Claude history or gogoagent state. Inspect both
images before committing them after any UI change.

## Sidecar endpoints

The sidecar binds to `127.0.0.1:43111` (loopback-only). Poke it directly:

```bash
GOGOAGENT_PORT="${GOGOAGENT_PORT:-43111}"
GOGOAGENT_TOKEN="$(tr -d '\r\n' < "$HOME/.gogoagent/sidecar-${GOGOAGENT_PORT}.token")"

# Health + debug
curl -s "http://127.0.0.1:${GOGOAGENT_PORT}/health"
curl -s -H "authorization: Bearer ${GOGOAGENT_TOKEN}" "http://127.0.0.1:${GOGOAGENT_PORT}/debug/state" | python3 -m json.tool
curl -s -X POST -H "authorization: Bearer ${GOGOAGENT_TOKEN}" "http://127.0.0.1:${GOGOAGENT_PORT}/debug/rescan" | python3 -m json.tool

# Projects (workstreams) — the left pane's source of truth
curl -s -H "authorization: Bearer ${GOGOAGENT_TOKEN}" "http://127.0.0.1:${GOGOAGENT_PORT}/projects" | python3 -m json.tool | head -40

# Detail for one project (pick an id from /projects above)
curl -s -H "authorization: Bearer ${GOGOAGENT_TOKEN}" "http://127.0.0.1:${GOGOAGENT_PORT}/projects/workstream-<id>" | python3 -m json.tool

# Full snapshot (everything the UI might render)
curl -s -H "authorization: Bearer ${GOGOAGENT_TOKEN}" "http://127.0.0.1:${GOGOAGENT_PORT}/snapshot" | python3 -m json.tool | head -60

# Session detail (messages, artifacts, extraction candidates)
curl -s -H "authorization: Bearer ${GOGOAGENT_TOKEN}" "http://127.0.0.1:${GOGOAGENT_PORT}/sessions/<sessionId>" | python3 -m json.tool

# Message search
curl -s -H "authorization: Bearer ${GOGOAGENT_TOKEN}" "http://127.0.0.1:${GOGOAGENT_PORT}/search/messages?q=retraded" | python3 -m json.tool
```

## Refining lessons with codex

The "Refine lessons" button in the UI posts to `/lessons/refine` with a
`projectId`. The sidecar shells out to the `codex` CLI per candidate
and saves results to `~/.gogoagent/state/refined-lessons.json`.

```bash
GOGOAGENT_PORT="${GOGOAGENT_PORT:-43111}"
GOGOAGENT_TOKEN="$(tr -d '\r\n' < "$HOME/.gogoagent/sidecar-${GOGOAGENT_PORT}.token")"

# Dry-run: preview which candidates would be sent to codex
curl -s -X POST "http://127.0.0.1:${GOGOAGENT_PORT}/lessons/refine" \
  -H "authorization: Bearer ${GOGOAGENT_TOKEN}" \
  -H 'content-type: application/json' \
  -d '{"projectId":"workstream-<id>","dryRun":true}' | python3 -m json.tool

# Real run (scoped to one project)
curl -s -X POST "http://127.0.0.1:${GOGOAGENT_PORT}/lessons/refine" \
  -H "authorization: Bearer ${GOGOAGENT_TOKEN}" \
  -H 'content-type: application/json' \
  -d '{"projectId":"workstream-<id>"}'

# Poll job status (jobId comes from the POST response)
curl -s -H "authorization: Bearer ${GOGOAGENT_TOKEN}" "http://127.0.0.1:${GOGOAGENT_PORT}/lessons/refine/status/<jobId>" | python3 -m json.tool

# Force re-refine (bypass cache)
curl -s -X POST "http://127.0.0.1:${GOGOAGENT_PORT}/lessons/refine" \
  -H "authorization: Bearer ${GOGOAGENT_TOKEN}" \
  -H 'content-type: application/json' \
  -d '{"sessionIds":["<sessionId>"],"force":true}'

# List cached refined lessons
curl -s -H "authorization: Bearer ${GOGOAGENT_TOKEN}" "http://127.0.0.1:${GOGOAGENT_PORT}/lessons/refined" | python3 -m json.tool
curl -s -H "authorization: Bearer ${GOGOAGENT_TOKEN}" "http://127.0.0.1:${GOGOAGENT_PORT}/lessons/refined?sessionId=<sessionId>" | python3 -m json.tool
```

There's also a helper script that wraps the refine+poll loop for one session:

```bash
./scripts/refine-session.sh <sessionId>
```

## Where things live

```
apps/desktop/src/renderer/       index.html, renderer.ts, styles.css
apps/desktop/src/main.ts         Electron main process
services/sidecar/src/index.ts    HTTP routes
services/sidecar/src/lib/        parseTranscript, buildSnapshotModel,
                                 buildWorkstreams, refine{Lessons,Cache,Jobs}
packages/shared/src/index.ts     shared TS types
```

## Data gogoagent reads

Read-only; never modified:

- `~/.claude/projects/**/*.jsonl` — transcripts (subagent files under
  `<sessionId>/subagents/` are skipped; they share the parent's sessionId)
- `~/.claude/history.jsonl` — per-workdir user-prompt history
- `~/.claude/sessions/*.json` — session metadata
- `~/.claude/todos/*.json` — todo lists

## Debug tips

- UI looks stale? Click **Refresh** (top-left) or hit `/debug/rescan`.
- Sidecar crashed? Check `/debug/state` — `errors[]` shows the last failures.
- Duplicate sessions in `/snapshot`? Make sure the `/subagents/` filter
  is intact in `services/sidecar/src/index.ts::loadTranscripts`.
- Codex refine failing with "Unexpected end of JSON input"? The
  `--output-last-message` file was empty — usually means the configured
  model is rejected by your codex account. Try a different model.
