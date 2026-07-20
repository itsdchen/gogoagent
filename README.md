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

- `~/.gogoagent/cache/transcripts-v1.json`

Later scans reuse cached transcripts when the file path, size, modified time, and dependent Claude metadata still match. This keeps repeat launches from reparsing unchanged history. `POST /debug/rescan` still forces a fresh snapshot walk, but valid transcript parse cache entries are reused.

Set `GOGOAGENT_SNAPSHOT_CACHE_MS` to tune the short in-memory snapshot de-dupe window. The default is `1000` ms.

LLM-generated workstream labels are cached at:

- `~/.cache/gogoagent/workstream-labels.json`

Use the sidebar `Label names` action to generate or refresh labels. Labeling runs through the local `codex` CLI and is skipped for workstreams whose cached label is still current.

## Prereqs

- Node 20+
- `corepack` available
- pnpm via corepack

## Install

From the repo root:

```bash
corepack pnpm install
```

The workspace explicitly approves `node-pty`'s required native build, so
the command above builds the terminal integration automatically. On Linux,
that build needs standard C/C++ build tools and Python. If the install reports
a compiler error, install your distribution's development-tool package and
Python, then rerun the command.

If an older or interrupted install left the native module missing, rebuild it:

```bash
corepack pnpm rebuild node-pty
```

If you see `Electron failed to install correctly`, reinstall Electron's
binary directly:

```bash
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
corepack pnpm --filter @gogoagent/desktop dev
```

This is the main command to use right now.

It should:

- build the desktop app pieces
- start the sidecar in dev mode
- launch the Electron UI

Pressing Ctrl+C in that command stops both Electron and the sidecar. Closing
the Electron window can leave the sidecar running so live terminal sessions
survive app window restarts.

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
curl http://127.0.0.1:43111/health
curl http://127.0.0.1:43111/snapshot | jq
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

It starts the sidecar with a temporary empty home directory, confirms the
empty snapshot is healthy, then adds one fixture Claude transcript and confirms
that it appears as a workstream. It never reads from or writes to your real
`~/.claude` or `~/.gogoagent` directories.

## Current UI modes

The desktop app currently has top-level modes for:

- **Threads**
- **Worked Here**
- **Lessons**
- **Sessions**
- **Debug**

The UX is intentionally moving toward:

- minimal by default
- progressively disclosed detail
- fewer simultaneously visible panels

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
   corepack pnpm --filter @gogoagent/desktop dev
   ```
2. Open the app
3. Start in:
   - **Threads** for clustered workstreams
   - **Worked Here** for directories Claude has operated in
   - **Lessons** for correction review
4. Use **Sessions** when you need transcript-level detail
5. Use **Debug** only when something looks off

## Development notes

If something seems broken, first run:

```bash
corepack pnpm typecheck
corepack pnpm --filter @gogoagent/sidecar build
corepack pnpm --filter @gogoagent/desktop build
```

That should catch most current issues quickly.
