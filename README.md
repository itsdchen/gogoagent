# gogoagent

AI coding work gets scattered across terminal windows and past conversations.
It becomes difficult to remember what each session was doing—or notice when an
agent is waiting for input.

gogoagent is a local-first desktop console that groups Claude Code history and
live Claude, Codex, or shell terminals into workstreams, preserves their
context, and highlights work that needs attention. A workstream is the related
sessions and terminals for one repository and branch.

![gogoagent showing a Claude terminal waiting for input](./docs/screenshots/overview.png)

*This screenshot uses generated repositories, transcripts, and terminal
output. See the [safe capture workflow](./docs/screenshots/README.md).*

> **Project status:** gogoagent currently runs from source; there is no
> packaged installer yet. Linux is the primary development platform. macOS
> support is intended but has not yet received the same level of testing.

## Quick start

### Prerequisites

Required:

- macOS or Linux with Git and Bash;
- Node.js 20 or newer; and
- Corepack.

Optional:

- the `claude` CLI to launch Claude Code;
- the `codex` CLI to launch Codex, improve names, or refine lessons.

Confirm the required runtime:

```bash
node --version
corepack --version
```

If Node is installed but Corepack is missing:

```bash
npm install --global corepack@latest
```

If a native dependency must compile, macOS may require Xcode Command Line
Tools (`xcode-select --install`); Linux may require Python and the
distribution's standard C/C++ build tools.

### Install and launch

```bash
git clone https://github.com/itsdchen/gogoagent.git
cd gogoagent
./start.sh
```

`./start.sh` installs missing dependencies, repairs Electron or `node-pty`
when necessary, builds the app, safely starts or reuses its local sidecar, and
opens Electron. The first run needs network access and may take a few minutes.

To prepare and verify the installation without opening the app:

```bash
./start.sh --check
```

### Start working

- Existing Claude Code history under `~/.claude` appears automatically.
- An empty list is normal if there is no Claude history yet.
- To start fresh, choose a directory, select **Claude**, **Codex**, or
  **Shell**, and press the Start button.
- A yellow `>` marks a live terminal that appears to be waiting for input;
  select it to jump to that terminal.

![gogoagent new-workstream launcher](./docs/screenshots/launcher.png)

## What it helps with

- Recover the intent and history behind work spread across several sessions.
- Keep live agent terminals attached to the work they belong to.
- See when Claude or Codex appears to be waiting for approval or input.
- Review timelines, transcript excerpts, touched paths, and terminal logs.
- Search, pin, archive, rename, and label workstreams.
- Copy focused context when continuing work or handing it to another agent.

gogoagent is an operations console for local AI coding work—not a hosted team
workspace or general task manager.

## Privacy and local data

Discovery, indexing, storage, and terminal management run locally. gogoagent
reads local Claude Code artifacts such as:

- `~/.claude/projects/**/*.jsonl`
- `~/.claude/history.jsonl`
- `~/.claude/sessions/*.json`
- `~/.claude/todos/*.json`

It does not intentionally read Claude credentials or authentication material.
The sidecar listens only on `127.0.0.1` and protects every route except its
health check with a per-run token that is not exposed to renderer code.

Optional model-powered actions have a different boundary:

- **Improve names** invokes the installed Codex CLI with selected context such
  as repository and branch names, clipped user or terminal messages, and
  touched paths.
- Lesson refinement invokes the installed Codex CLI with candidate lesson text
  and nearby conversation context.

Those actions may contact the model provider configured for the Codex CLI.
They are not required for discovery or terminal management, and automatic
naming is off by default.

gogoagent writes its own data under:

- `~/.gogoagent/terminal-logs/` — terminal metadata and output;
- `~/.gogoagent/cache/` — regenerable transcript indexes;
- `~/.gogoagent/state/` — names, archives, and refined lessons;
- `~/.cache/gogoagent/` — legacy data retained for migration.

Terminal logs can contain commands and output from embedded terminals; treat
`~/.gogoagent` as private. Older durable state under `~/.cache/gogoagent` is
copied into `~/.gogoagent/state` on first use without deleting the original.

## Startup and terminal lifecycle

The sidecar owns live PTYs and listens on `http://127.0.0.1:43111` by default.
`./start.sh` reuses a healthy sidecar on that port instead of silently moving
to another port and hiding its terminals.

Closing Electron may leave the sidecar running so terminals survive a window
restart. Pressing Ctrl+C in the terminal that launched gogoagent stops Electron
and any sidecar started by that command.

Restart only the frontend while retaining a healthy sidecar:

```bash
./start.sh --frontend
```

Run an intentionally separate instance on another port:

```bash
GOGOAGENT_PORT=43112 ./start.sh
```

## Troubleshooting

Start with:

```bash
./start.sh --check
```

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for Corepack, native dependency,
Electron sandbox, occupied-port, missing-workstream, and agent CLI guidance.

## Development

See [DEVELOPMENT.md](./DEVELOPMENT.md) for architecture, commands, sidecar
endpoints, verification, and safe screenshot regeneration. Contributors and
coding agents should also read [AGENTS.md](./AGENTS.md).

## Current limitations

- Installation still requires a source checkout and Node.js toolchain.
- Discovery currently focuses on local Claude Code artifacts and gogoagent's
  own terminal logs.
- Worktree and touched-path inference remain heuristic in some cases.
- There is no durable manual merge or relate workflow yet.
