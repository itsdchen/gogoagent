# Hacking on gogoagent

Day-to-day commands for running, poking, and debugging the app.
See `README.md` for what gogoagent *is* and `TROUBLESHOOTING.md` for startup
recovery.

## Run the app (dev)

From the repo root:

```bash
./start.sh
```

That script:

1. Installs or repairs missing dependencies.
2. Builds `@gogoagent/shared` and `@gogoagent/desktop`.
3. Reuses a healthy sidecar on the selected port, or starts one without file
   watching.
4. Launches Electron pointed at the built renderer.

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

## Attach the desktop to a remote sidecar

Run the sidecar on the remote host after installing dependencies and building
`@gogoagent/shared`:

```bash
corepack pnpm --filter @gogoagent/sidecar dev
```

On the local desktop, run `./start.sh --remote user@host`. The launcher reads
the remote sidecar token over SSH, saves it in a temporary local file with
owner-only permissions, forwards a free local loopback port to remote
`127.0.0.1:43111`, and launches Electron against that tunnel. It removes the
temporary file and closes the tunnel when Electron exits. The sidecar stays
running. Set `GOGOAGENT_REMOTE_PORT` if the remote sidecar uses another port.

The remote SSH user must own the sidecar token file and have access to the
repositories and agent CLIs. Both machines should use the same gogoagent
source version. Restart the attachment after a sidecar restart to pick up its
new per-run token. The remote sidecar remains loopback-only; no sidecar port
needs to be opened in a firewall.

## Build / typecheck everything

```bash
corepack pnpm -r typecheck        # type-only check across all workspaces
corepack pnpm -r build            # full build (shared, desktop, sidecar, mobile)
corepack pnpm --filter @gogoagent/sidecar build   # just sidecar
corepack pnpm test:launcher-port  # confirm occupied ports fail explicitly
corepack pnpm test:mobile         # mobile pairing/proxy smoke test
corepack pnpm test:mobile-lifecycle # sidecar-owned gateway survives desktop reconnect
corepack pnpm test:mobile-workspace # phone browser layout, drafts, navigation, and send races
corepack pnpm test:codex-sessions  # Codex discovery, native resume, and terminal deduplication
corepack pnpm test:decision-prompt # latest-prompt extraction and stale-choice IDs
```

## Run the phone UI

The workspace browser test uses synthetic data and a temporary Chrome profile.
It requires Node 22+ and `google-chrome` (override with `GOGOAGENT_TEST_BROWSER`).
It checks portrait, narrow, landscape, and reduced viewport layouts, plus draft
isolation, reload restoration, Back navigation, and concurrent sends. Set
`GOGOAGENT_TEST_SCREENSHOT` to an output PNG path for a synthetic workspace capture.
The reduced viewport check approximates a keyboard; also verify keyboard opening
and closing on an actual Android device.

The mobile UI is a separate, opt-in HTTP gateway. The PTY-owning sidecar stays
bound to loopback, and its authentication token stays server-side.

For the normal product flow, click **Connect phone** in the desktop footer.
The sidecar starts the gateway on an ephemeral port, and Electron displays QR
codes for the sidecar host's reachable IPv4 addresses. QR links
use a high-entropy token that expires after ten minutes and rotates after a
successful pairing. Closing Electron leaves the gateway and paired phone
sessions running. Explicit **Stop phone access** or sidecar exit ends them.

For headless testing, start a gateway reachable on a trusted private network:

```bash
GOGOAGENT_MOBILE_HOST=0.0.0.0 \
GOGOAGENT_MOBILE_ALLOW_REMOTE=1 \
corepack pnpm mobile
```

The gateway prints its reachable URLs and a per-run six-digit pairing code. It
defaults to port `43112`; override that with `GOGOAGENT_MOBILE_PORT`. Remote
binding is rejected unless `GOGOAGENT_MOBILE_ALLOW_REMOTE=1` is present.

This development command serves plain HTTP. Do not port-forward it onto the
public internet. Prefer a private VPN address or put the loopback gateway
behind an HTTPS reverse proxy. When TLS terminates in front of the gateway, set
`GOGOAGENT_MOBILE_SECURE_COOKIE=1` so paired-session cookies are HTTPS-only.

The gateway exposes a narrow mobile API for workstream lists/details, shared
last-viewed state, reviewed native-session continuation, the attention inbox,
state edits, terminal-log reads, and reviewed responses to
running Claude or Codex terminals. It does not proxy raw terminal writes or
terminal create, kill, close, or resize operations.

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

# Prioritized attention items (waiting agents, completed agents, saved blockers)
curl -s -H "authorization: Bearer ${GOGOAGENT_TOKEN}" "http://127.0.0.1:${GOGOAGENT_PORT}/attention" | python3 -m json.tool

# Detail for one project (pick an id from /projects above)
curl -s -H "authorization: Bearer ${GOGOAGENT_TOKEN}" "http://127.0.0.1:${GOGOAGENT_PORT}/projects/workstream-<id>" | python3 -m json.tool

# Save the durable state capsule for one workstream
curl -s -X PATCH "http://127.0.0.1:${GOGOAGENT_PORT}/workstreams/workstream-<id>/state" \
  -H "authorization: Bearer ${GOGOAGENT_TOKEN}" \
  -H 'content-type: application/json' \
  -d '{"goal":"Ship the fix","currentState":"Implementation complete","blocker":"","nextAction":"Review the diff","lastVerification":"Typecheck passed"}' | python3 -m json.tool

# Send reviewed feedback to a running Claude/Codex terminal (not shell terminals)
curl -s -X POST "http://127.0.0.1:${GOGOAGENT_PORT}/terminals/<terminalId>/respond" \
  -H "authorization: Bearer ${GOGOAGENT_TOKEN}" \
  -H 'content-type: application/json' \
  -d '{"text":"1","submit":true}' | python3 -m json.tool

# Git state used by the continuation review
curl -s -H "authorization: Bearer ${GOGOAGENT_TOKEN}" "http://127.0.0.1:${GOGOAGENT_PORT}/fs/repository-state?path=<url-encoded-path>" | python3 -m json.tool

# Full snapshot (everything the UI might render)
curl -s -H "authorization: Bearer ${GOGOAGENT_TOKEN}" "http://127.0.0.1:${GOGOAGENT_PORT}/snapshot" | python3 -m json.tool | head -60

# Session detail (messages, artifacts, extraction candidates)
curl -s -H "authorization: Bearer ${GOGOAGENT_TOKEN}" "http://127.0.0.1:${GOGOAGENT_PORT}/sessions/<sessionId>" | python3 -m json.tool

# Message search
curl -s -H "authorization: Bearer ${GOGOAGENT_TOKEN}" "http://127.0.0.1:${GOGOAGENT_PORT}/search/messages?q=timeout" | python3 -m json.tool
```

## Refining lessons with codex

The **Extract lessons** button in the UI posts to `/lessons/refine` with a
`projectId`. The sidecar shells out to the `codex` CLI per candidate
and saves results to `~/.gogoagent/state/refined-lessons.json`. This sends the
candidate text and nearby conversation context through the configured Codex
CLI; it is not part of local-only discovery or indexing.

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
apps/desktop/src/electron/       Electron main process and preload bridge
apps/desktop/src/renderer/       HTML, renderer behavior, and styles
apps/desktop/scripts/dev.mjs     desktop/sidecar development launcher
services/mobile/                 paired, phone-friendly web gateway and UI
services/sidecar/src/index.ts    loopback HTTP routes
services/sidecar/src/lib/        discovery, workstreams, terminals, refinement
packages/shared/src/index.ts     shared TypeScript types
scripts/                         smoke tests and developer utilities
```

## Data gogoagent reads

Read-only; never modified:

- `~/.claude/projects/**/*.jsonl` — transcripts (subagent files under
  `<sessionId>/subagents/` are skipped; they share the parent's sessionId)
- `~/.claude/history.jsonl` — per-workdir user-prompt history
- `~/.claude/sessions/*.json` — session metadata
- `~/.claude/todos/*.json` — todo lists
- `~/.codex/sessions/**/*.jsonl` (or `$CODEX_HOME/sessions`) — saved Codex
  session rollouts; native resume uses their session IDs

## Debug tips

- UI looks stale? Click **Refresh** (top-left) or hit `/debug/rescan`.
- Sidecar crashed? Check `/debug/state` — `errors[]` shows the last failures.
- Duplicate sessions in `/snapshot`? Make sure the `/subagents/` filter
  is intact in `services/sidecar/src/index.ts::loadTranscripts`.
- Codex refine failing with "Unexpected end of JSON input"? The
  `--output-last-message` file was empty — usually means the configured
  model is rejected by your codex account. Try a different model.
