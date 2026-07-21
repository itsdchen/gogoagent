# Troubleshooting gogoagent

Run diagnostics from the repository root:

```bash
./start.sh --check
```

This checks Node.js and Corepack, installs missing workspace dependencies,
repairs Electron or `node-pty` when possible, and reports anything that still
needs manual attention.

## Node.js is unsupported

Install Node.js 20 or newer, confirm `node --version`, and rerun `./start.sh`.
Do not reuse `node_modules` copied from another repository, operating system,
CPU architecture, or Node.js version.

## Corepack or pnpm cannot run

If Node is installed but `corepack --version` fails:

```bash
npm install --global corepack@latest
corepack --version
./start.sh
```

If Corepack exists but pnpm cannot run:

```bash
corepack enable
corepack pnpm install
./start.sh
```

## `node-pty` cannot load `pty.node`

Rerun `./start.sh`; it detects and rebuilds a missing native module. If
compilation fails, install the platform build tools and retry:

- macOS: run `xcode-select --install`;
- Linux: install Python and the distribution's standard C/C++ build tools.

The underlying repair command is:

```bash
corepack pnpm rebuild node-pty
```

## Electron's Linux sandbox helper is misconfigured

If Electron reports that `chrome-sandbox` must be owned by root with mode
`4755`, run from the repository root:

```bash
SANDBOX=$(ls node_modules/.pnpm/electron@*/node_modules/electron/dist/chrome-sandbox)
sudo chown root:root "$SANDBOX"
sudo chmod 4755 "$SANDBOX"
```

Electron reinstalls can require repeating this fix. This issue does not apply
to macOS.

## Port 43111 is occupied

gogoagent reuses a healthy sidecar on the selected port. If another process
owns it, inspect the listener before stopping anything:

```bash
lsof -nP -iTCP:43111 -sTCP:LISTEN
ps -ax -o pid=,command= | grep -E 'tsx.*src/index.ts|services/sidecar|gogoagent'
```

After confirming that the listener is safe to stop:

```bash
lsof -tiTCP:43111 -sTCP:LISTEN | while IFS= read -r pid; do kill "$pid"; done
```

Stopping a gogoagent sidecar ends its live terminals. To keep both processes,
select another port explicitly:

```bash
GOGOAGENT_PORT=43112 ./start.sh
```

## Previously visible workstreams appear to be gone

Confirm that the new window uses the same sidecar port and operating-system
user/home directory. Live PTYs belong to one sidecar; a window connected to a
different port cannot see them.

Durable names, archives, lessons, and terminal logs live under
`~/.gogoagent` and should survive restarts. Use the app's **Debug** dialog to
inspect discovery paths and recent scan errors. Do not delete
`~/.gogoagent` or `~/.cache/gogoagent` while investigating missing data.

## Claude or Codex immediately exits

Confirm the corresponding CLI is installed, authenticated, and available in
the shell that starts gogoagent:

```bash
claude --version
codex --version
```

The built-in shell launcher works when neither agent CLI is installed.
