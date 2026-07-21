# gogoagent

gogoagent helps you run and organize Claude Code and Codex workflows, see
which agents need input, share useful memories between them, and pick up old
workstreams where you left off.

![gogoagent showing a Claude terminal waiting for input](./docs/screenshots/overview.png)

*Shown with generated repositories, transcripts, and terminal output. See the
[safe capture workflow](./docs/screenshots/README.md).*

## Why it helps

- **Too many conversations to keep straight.** gogoagent groups sessions and
  terminals for the same repo and branch into one workstream, with its history,
  touched paths, and terminal logs in one place.
- **An agent is waiting in a buried terminal.** A yellow `>` marks the
  workstream that needs input and jumps straight to it.
- **Switching agents means explaining everything again.** gogoagent can carry
  Claude Code memories into Codex, or Codex instructions back into Claude
  Code. It pastes a short handoff into the new terminal for you to review
  before sending instead of dumping the whole transcript.
- **Old work is hard to restart.** Return to the workstream, resume its latest
  Claude conversation when possible, or start Codex with the relevant context.
- **The work list gets noisy.** Search, rename, pin, and archive workstreams as
  priorities change.

> **Project status:** gogoagent runs from source; there is no installer yet.
> Most development happens on Linux. macOS should work but has had less
> testing.

## Quick start

You need:

- macOS or Linux with Git and Bash
- Node.js 20 or newer
- Corepack

The `claude` and `codex` CLIs are optional. Install either one if you want
gogoagent to launch it. Codex is also used for optional naming and lesson
extraction.

Check your setup:

```bash
node --version
corepack --version
```

If Node is installed but Corepack is not:

```bash
npm install --global corepack@latest
```

Then clone and launch:

```bash
git clone https://github.com/itsdchen/gogoagent.git
cd gogoagent
./start.sh
```

`./start.sh` installs missing packages, repairs Electron or `node-pty` when
needed, builds the app, starts or reuses the local sidecar, and opens Electron.
The first run needs network access and may take a few minutes.

To check everything without opening the app:

```bash
./start.sh --check
```

If `node-pty` has to build from source, macOS may need Xcode Command Line Tools
(`xcode-select --install`); Linux may need Python and standard C/C++ build
tools.

Existing Claude Code history under `~/.claude` appears on first launch. An
empty list is normal if there is no history yet. To start new work, choose a
directory, select **Claude**, **Codex**, or **Shell**, and press Start.

Memory sharing between Claude Code and Codex is on by default; either direction
can be turned off in Settings.

![gogoagent new-workstream launcher](./docs/screenshots/launcher.png)

## What stays local

Coding transcripts and terminal logs can contain private code and sensitive
output. gogoagent keeps discovery, indexing, storage, terminal management, and
cross-agent memory handoffs on your machine.

The sidecar listens only on `127.0.0.1` and protects every route except its
health check with a per-run token that renderer code cannot access. gogoagent
does not intentionally read Claude credentials or authentication files.

Two optional actions use your installed Codex CLI and may contact its
configured model provider:

- **Improve names** sends selected repo and branch names, clipped user or
  terminal messages, and touched paths.
- **Extract lessons** sends candidate lesson text and nearby conversation
  context.

Neither action is needed for discovery or terminal management, and automatic
naming is off by default. Memory sharing is different: the handoff is built
locally, and nothing is sent until you review it in the new terminal.

<details>
<summary>Files gogoagent reads and writes</summary>

It reads Claude Code history from:

- `~/.claude/projects/**/*.jsonl`
- `~/.claude/history.jsonl`
- `~/.claude/sessions/*.json`
- `~/.claude/todos/*.json`

It stores its own data under:

- `~/.gogoagent/terminal-logs/` — terminal metadata and output
- `~/.gogoagent/cache/` — regenerable transcript indexes
- `~/.gogoagent/state/` — names, archives, and refined lessons
- `~/.cache/gogoagent/` — older data retained for migration

Terminal logs can contain commands and output from embedded terminals, so
treat `~/.gogoagent` as private. On first use, older saved state in
`~/.cache/gogoagent` is copied into `~/.gogoagent/state`; the original files
are left alone.

</details>

## How terminals stay alive

Closing the window should not kill long-running work. gogoagent keeps live
terminals in a small local background process called the sidecar. Closing
Electron may leave that process running so the terminals survive a window
restart; pressing Ctrl+C stops Electron and any sidecar started by that
launcher. A sidecar reused from an earlier run stays alive.

`./start.sh` reuses a healthy sidecar at `http://127.0.0.1:43111` instead of
switching ports and making its terminals look like they disappeared.

Restart only the window while keeping the sidecar:

```bash
./start.sh --frontend
```

Run a separate copy on another port:

```bash
GOGOAGENT_PORT=43112 ./start.sh
```

## Troubleshooting

Start with:

```bash
./start.sh --check
```

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common setup and recovery
problems.

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for architecture, commands, sidecar
endpoints, verification, and safe screenshot regeneration. Contributors and
coding agents should also read [AGENTS.md](./AGENTS.md).

## Current limitations

- Discovery starts with local Claude Code history. Codex work appears when it
  is launched or logged through gogoagent.
- Worktree and touched-path inference remain heuristic in some cases.
- There is no durable manual merge or relate workflow yet.
