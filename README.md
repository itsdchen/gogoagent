# gogoagent

Local-first organizer for Claude Code session history, threads, work locations, and extracted lessons.

## What it is

gogoagent is a local desktop app + sidecar service for exploring Claude Code work that already happened on your machine.

Current focus:

- discover Claude Code sessions from local artifacts in `~/.claude`
- group them into projects and thread-like clusters
- surface where Claude has worked (`worked here` / work locations)
- search transcripts
- launch and own live shell/Claude/Codex terminal sessions
- persist and index owned terminal logs
- label workstreams with cached LLM-generated names
- extract summaries, rules, todos, and lessons from corrections

It is starting to become a local control plane, but the core model is still local-first recovery, context, and workstream memory.

## Current architecture

This repo is a small pnpm workspace:

```text
apps/
  desktop/         Electron app
services/
  sidecar/         local discovery + parsing backend
packages/
  shared/          shared types
```

## What the app reads

gogoagent currently discovers Claude activity from local files such as:

- `~/.claude/projects/**/*.jsonl`
- `~/.claude/history.jsonl`
- `~/.claude/sessions/*.json`
- `~/.claude/todos/*.json`
- `~/.gogoagent/terminal-logs/*.json`
- `~/.gogoagent/terminal-logs/*.ansi.log`

It should **not** ingest Claude credentials or auth material.

Set `GOGOAGENT_TERMINAL_LOG_DIR` to override the terminal-log directory for both the desktop app and sidecar.

Live terminals can be started two ways:

- from a selected workstream, which hard-attaches the terminal log back to that workstream
- from the sidebar "Start anywhere" launcher, which starts unattached from the chosen directory and indexes later into a fresh workstream by repo, branch, and time

## Startup and indexing

On first scan, the sidecar parses Claude JSONL transcripts and writes a local parse cache at:

- `~/.gogoagent/cache/transcripts-v2.json`

Later scans reuse cached transcripts when the file path, size, modified time, and dependent Claude metadata still match. This keeps repeat launches from reparsing unchanged history. `POST /debug/rescan` still forces a fresh snapshot walk, but valid transcript parse cache entries are reused.

Set `GOGOAGENT_SNAPSHOT_CACHE_MS` to tune the short in-memory snapshot de-dupe window. The default is `1000` ms.

Durable user-visible state is stored under:

- `~/.gogoagent/state/title-overrides.json`
- `~/.gogoagent/state/workstream-labels.json`
- `~/.gogoagent/state/workstream-archive.json`
- `~/.gogoagent/state/refined-lessons.json`

On first use, older copies of these files under `~/.cache/gogoagent` are
copied into the state directory without deleting the originals. Set
`GOGOAGENT_STATE_DIR` to override the state directory. Regenerable caches and
legacy auto-title fallbacks remain under `~/.cache/gogoagent`.

Use the sidebar naming action to generate or refresh workstream labels.
Labeling runs through the local `codex` CLI, deduplicates identical active
jobs, and skips workstreams whose saved label is still current.

## Prereqs

- Node 20+
- `corepack` available
- pnpm via corepack

## Install

The first launch can bootstrap itself. From the repo root, run:

```bash
./start.sh
```

If workspace dependencies, `node-pty`'s native module, or Electron's application
binary are missing, the script installs or repairs them before launching. On
Linux, building `node-pty` needs standard C/C++ build tools and Python. If that
build reports a compiler error, install your distribution's development-tool
package and Python, then rerun `./start.sh`.

To prepare and verify dependencies without launching the app:

```bash
./start.sh --check
```

The equivalent manual installation command is:

```bash
corepack pnpm install
```

If an automatic repair fails, the underlying commands are:

```bash
corepack pnpm rebuild node-pty
node node_modules/.pnpm/electron@*/node_modules/electron/install.js
```

### Linux sandbox permissions

On Linux, Electron's `chrome-sandbox` helper must be owned by root and
setuid (mode 4755). If you see a fatal error like
`The SUID sandbox helper binary was found, but is not configured correctly`,
fix the permissions on the installed binary:

```bash
SANDBOX=$(ls node_modules/.pnpm/electron@*/node_modules/electron/dist/chrome-sandbox)
sudo chown root:root "$SANDBOX"
sudo chmod 4755 "$SANDBOX"
```

You will need to redo this any time Electron is reinstalled.

## Run the app

### Easiest way: start the desktop app

```bash
./start.sh
```

This is the main command to use right now. It checks the installed Node.js,
pnpm, Electron, and native terminal dependency before launching, then tells
you how to correct any missing prerequisite.

It should:

- build the desktop app pieces
- start the sidecar in dev mode
- launch the Electron UI

Pressing Ctrl+C stops Electron and any sidecar started by that command. A
sidecar reused from an earlier launch stays running. Closing the Electron
window can also leave the sidecar running so live terminal sessions survive
app window restarts.

The launcher reuses a healthy sidecar on the selected port. It never switches
to another port automatically, because doing so would make the first sidecar's
live terminals disappear from the new window. To run a separate instance,
choose the port explicitly, for example `GOGOAGENT_PORT=43112 ./start.sh`.

### Run only the sidecar

```bash
corepack pnpm --filter @gogoagent/sidecar dev
```

By default the sidecar serves on:

- `http://127.0.0.1:43111`

Useful endpoints:

- `GET /health`
- `GET /snapshot`
- `GET /sessions/:id`
- `GET /search/messages?q=...`

Example:

```bash
GOGOAGENT_PORT="${GOGOAGENT_PORT:-43111}"
GOGOAGENT_TOKEN="$(tr -d '\r\n' < "$HOME/.gogoagent/sidecar-${GOGOAGENT_PORT}.token")"

# Health is public. All other endpoints require the per-run bearer token.
curl "http://127.0.0.1:${GOGOAGENT_PORT}/health"
curl -H "authorization: Bearer ${GOGOAGENT_TOKEN}" \
  "http://127.0.0.1:${GOGOAGENT_PORT}/snapshot" | jq
```

## Build / verify

### Typecheck everything

```bash
corepack pnpm typecheck
```

### Build the sidecar

```bash
corepack pnpm --filter @gogoagent/sidecar build
```

### Build the desktop app

```bash
corepack pnpm --filter @gogoagent/desktop build
```

### Clean-start smoke test

Run the isolated first-run test with:

```bash
corepack pnpm test:clean-start
```

It starts and restarts the sidecar with a temporary home directory, checks the
authentication boundary and token rotation, verifies empty and populated
discovery, confirms stale terminal logs appear as history, migrates durable
state out of cache, and checks that duplicate label requests share one job. It
never writes to your real `~/.claude`, `~/.gogoagent`, or
`~/.cache/gogoagent` directories.

The launcher regression test confirms an occupied port never causes an
implicit switch:

```bash
corepack pnpm test:launcher-port
```

## Current UI

The desktop app centers on a workstream list and one selected workstream's
timeline. From there you can:

- start a shell, Claude, or Codex terminal in a working directory
- inspect sessions, messages, artifacts, work locations, and lessons
- search transcript messages
- archive or restore workstreams
- open Debug when discovery or indexing looks wrong

## What works today

- local Claude artifact discovery
- session browsing
- thread/cluster browsing
- work-location rollups with evidence levels
- transcript search with snippets
- session detail with extracted candidates
- lessons review + markdown/JSON export
- branch-aware thread metadata and related-thread suggestions

## Evidence levels for work locations

gogoagent currently uses these labels:

- `workspace_root` — session cwd / inferred project root
- `touched` — Claude likely changed something there
- `inspected` — Claude likely read/searched/listed it
- `mentioned` — path appeared in transcript text/output

These are still heuristic, but getting stronger over time.

## Current limitations

- no packaged installer yet
- not a polished end-user release yet
- no durable manual merge/relate persistence yet
- worktree inference still needs improvement
- touched detection is still heuristic in places
- sidecar is mid-refactor, though builds/typechecks should pass

## Recommended workflow for now

1. Run:
   ```bash
   ./start.sh
   ```
2. Open the app
3. Choose a discovered workstream, or enter a directory under **Start a
   workstream** and choose `+`.
4. Open session details from the timeline when you need transcript-level detail.
5. Use **Debug** only when discovery or indexing looks wrong.

## Development notes

If something seems broken, first run:

```bash
corepack pnpm typecheck
corepack pnpm --filter @gogoagent/sidecar build
corepack pnpm --filter @gogoagent/desktop build
```

That should catch most current issues quickly.
