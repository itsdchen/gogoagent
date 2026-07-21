# gogoagent

gogoagent is a local-first desktop console for recovering context from Claude
Code history and running long-lived Claude, Codex, or shell workstreams.

It discovers work already on your machine, groups related sessions into
workstreams, keeps live terminals attached to those workstreams, and helps you
see what needs attention without sending your history to a hosted service.

> **Project status:** gogoagent currently runs from source as a development
> app. There is no packaged installer yet. It is developed primarily on Linux.

## Quick start

### 1. Install the prerequisites

Required:

- Git and Bash
- Node.js 20 or newer
- Corepack, which is included with standard Node.js distributions

Optional:

- the `claude` CLI on `PATH` if you want to launch Claude Code
- the `codex` CLI on `PATH` if you want to launch Codex, improve workstream
  names, or extract lessons

Check the required runtime with:

```bash
node --version
corepack --version
```

On Linux, compiling the terminal dependency may also require Python and your
distribution's standard C/C++ build tools.

### 2. Clone and launch

```bash
git clone https://github.com/itsdchen/gogoagent.git
cd gogoagent
./start.sh
```

That one launcher is the normal way to start gogoagent. On the first run it:

1. checks Node.js and Corepack;
2. installs missing workspace dependencies;
3. repairs Electron or `node-pty` when their native files are missing;
4. builds the desktop app;
5. starts or safely reuses the local sidecar; and
6. opens the Electron window.

The first run needs network access to download dependencies and may take a few
minutes. To prepare and verify everything without opening the app, run:

```bash
./start.sh --check
```

### 3. Start using it

On first launch:

- Existing Claude Code history under `~/.claude` should appear automatically.
- An empty workstream list is normal if there is no Claude history yet.
- To start fresh, choose or browse to a directory under **Start a workstream**,
  choose **Claude**, **Codex**, or **Shell**, and press the Start button.
- Use **Improve names** when you want local Codex to generate clearer labels.
  Automatic naming is off by default and can be enabled in Settings.
- Open **Debug** if discovery or indexing does not look right.

Generated and manually edited workstream names are identified in the UI.
Manual names are never overwritten by automatic naming.

## What gogoagent does

- Discovers local Claude Code sessions and transcripts.
- Groups related sessions by repository, branch, and time into workstreams.
- Shows timelines, transcript excerpts, work locations, and extracted lessons.
- Launches and owns live Claude, Codex, and shell terminals.
- Preserves terminal logs and attaches them to workstreams.
- Highlights terminals that appear to be waiting for user input.
- Searches transcript messages.
- Archives, pins, renames, and labels workstreams.

The app is a local context and operations console, not a hosted collaboration
service or general task manager.

## Local data and privacy

gogoagent reads local development artifacts such as:

- `~/.claude/projects/**/*.jsonl`
- `~/.claude/history.jsonl`
- `~/.claude/sessions/*.json`
- `~/.claude/todos/*.json`
- `~/.gogoagent/terminal-logs/*`

It does not intentionally read Claude credentials or authentication material.
The sidecar listens only on `127.0.0.1` and protects every route except its
health check with a per-run token that is not exposed to the renderer.

gogoagent writes its own data under:

- `~/.gogoagent/terminal-logs/` — terminal metadata and output
- `~/.gogoagent/cache/` — regenerable transcript parse data
- `~/.gogoagent/state/` — names, archives, and refined lessons
- `~/.cache/gogoagent/` — legacy/regenerable caches retained for migration

Older durable state under `~/.cache/gogoagent` is copied into
`~/.gogoagent/state` on first use without deleting the original files.

Useful overrides:

- `GOGOAGENT_STATE_DIR`
- `GOGOAGENT_CACHE_DIR`
- `GOGOAGENT_TERMINAL_LOG_DIR`
- `GOGOAGENT_PORT`

## Startup and terminal lifecycle

The default sidecar address is `http://127.0.0.1:43111`.

`./start.sh` reuses a healthy gogoagent sidecar on that port. It never silently
switches to another port, because doing so would make the first sidecar's live
terminals disappear from the new window.

Closing the Electron window may intentionally leave the sidecar running so
live terminal sessions survive a frontend restart. Pressing Ctrl+C in the
terminal that launched gogoagent stops Electron and any sidecar started by that
command.

To run a separate instance, select another port explicitly:

```bash
GOGOAGENT_PORT=43112 ./start.sh
```

To rebuild and reopen only the frontend while keeping a running sidecar:

```bash
./start.sh --frontend
```

## Troubleshooting startup

### Node.js is unsupported

Install Node.js 20 or newer, confirm `node --version`, and rerun `./start.sh`.
Do not reuse `node_modules` copied from another repository or Node.js version;
the launcher will install the workspace's own dependencies.

### Corepack or pnpm cannot run

Try:

```bash
corepack enable
corepack pnpm install
./start.sh
```

### `node-pty` cannot load `pty.node`

Rerun `./start.sh`; it detects and rebuilds the missing native module. If the
rebuild reports a compiler error, install Python and your distribution's
development/build-tools package, then rerun the launcher.

The underlying repair command is:

```bash
corepack pnpm rebuild node-pty
```

### Electron's Linux sandbox helper is misconfigured

If Electron reports that `chrome-sandbox` must be owned by root with mode
`4755`, run from the repository root:

```bash
SANDBOX=$(ls node_modules/.pnpm/electron@*/node_modules/electron/dist/chrome-sandbox)
sudo chown root:root "$SANDBOX"
sudo chmod 4755 "$SANDBOX"
```

Electron reinstalls can require repeating this fix.

### Port 43111 is occupied

If the listener is a healthy gogoagent sidecar, `./start.sh` reuses it. If it is
another process, inspect it before stopping anything:

```bash
lsof -nP -iTCP:43111 -sTCP:LISTEN
pgrep -af 'tsx.*src/index.ts|services/sidecar|gogoagent'
```

To stop the listener after confirming it is safe to do so:

```bash
lsof -tiTCP:43111 -sTCP:LISTEN | xargs -r kill
```

Stopping a gogoagent sidecar ends its live terminals. Alternatively, run a
separate instance on an explicit unused port.

### Previously visible workstreams appear to be gone

First confirm that the new window is using the same sidecar port and the same
user account/home directory. Live PTYs belong to one sidecar process; a window
connected to another port will not see them. Durable names, archives, lessons,
and terminal logs live under `~/.gogoagent` and should survive restarts.

Use the app's **Debug** dialog to inspect discovery paths and recent scan
errors. Avoid deleting `~/.gogoagent` or `~/.cache/gogoagent` while diagnosing
missing data.

### Claude or Codex immediately exits

Confirm the corresponding CLI is installed, authenticated, and available in
the same shell that starts gogoagent:

```bash
claude --version
codex --version
```

The built-in shell launcher can still be used when neither agent CLI is
installed.

## Architecture

This repository is a pnpm workspace:

```text
apps/
  desktop/         Electron main process, preload bridge, and renderer
services/
  sidecar/         loopback API, discovery/indexing, PTYs, and local state
packages/
  shared/          shared TypeScript types
scripts/           smoke tests and developer utilities
```

The sidecar owns live PTYs. The preload exposes narrow, named operations to the
renderer and keeps the sidecar authentication token outside renderer code.

See [DEVELOPMENT.md](./DEVELOPMENT.md) and [AGENTS.md](./AGENTS.md) before
making non-trivial changes.

## Development and verification

Install dependencies manually when needed:

```bash
corepack pnpm install
```

Run the normal checks:

```bash
corepack pnpm typecheck
corepack pnpm build
corepack pnpm test:clean-start
corepack pnpm test:launcher-port
```

The clean-start test uses a temporary home directory. It does not write to your
real `~/.claude`, `~/.gogoagent`, or `~/.cache/gogoagent` directories.

To run only the sidecar during development:

```bash
corepack pnpm --filter @gogoagent/sidecar dev
```

For a hot-reloading sidecar on a separate port:

```bash
GOGOAGENT_PORT=43112 GOGOAGENT_WATCH_SIDECAR=1 ./start.sh
```

## Current limitations

- No packaged installer yet.
- First launch still requires a source checkout and Node.js toolchain.
- Discovery currently focuses on local Claude Code artifacts and gogoagent's
  own terminal logs.
- Worktree and touched-path inference remain heuristic in some cases.
- There is no durable manual merge/relate workflow yet.
