# gogoagent Agent Guide

Use this file when working on gogoagent. It contains repository-operating
context only; private roadmap, strategy, and planning notes intentionally live
outside this repository.

## Current Agent — Update This Section

Every agent that edits this repository must update this section when it starts
work, and leave it accurate when it hands off. Keep it short and never include
tokens, private transcript contents, personal paths, or customer data.

- Agent: Codex (current session)
- Task: Rewrite the README around concrete user pain, obvious value, and non-repetitive language.
- Started: 2026-07-21
- Status / next step: README tone is natural throughout, including privacy, terminal persistence, and limitations; ready for review and commit.
- Last verification: `git diff --check` passes. The change remains documentation-only and leaves the previously verified links, build, and screenshots unchanged.

## Product

gogoagent is a local-first operations console for long-running AI coding
workstreams. Its core job is to help a user see what needs attention,
understand a workstream, and safely continue or hand it off.

Prioritize attention, context recovery, safe terminal lifecycle, and local
trust. Do not turn it into a general task manager, visual editor, hosted team
workspace, or generic agent launcher without explicit direction.

## Repository Map

- `apps/desktop/`: Electron main process, preload bridge, and renderer.
- `services/sidecar/`: loopback service that owns PTYs, terminal logs,
  transcript indexing, and workstream state.
- `packages/shared/`: shared TypeScript types.
- `scripts/`: developer utilities.

Read `README.md` and `DEVELOPMENT.md` before making non-trivial changes.

## Naming and Data Rules

- Product name: `gogoagent`.
- Packages: `@gogoagent/*`.
- Renderer bridge: `window.gogoagent`.
- Environment variables: `GOGOAGENT_*`.
- Runtime data: `~/.gogoagent` and `~/.cache/gogoagent`.
- The remaining `spool.*` LocalStorage code is an intentional migration. Do
  not remove it without an explicit data-migration decision.

Do not commit terminal logs, transcript caches, secrets, personal paths, or
generated `dist/` and `node_modules/` content.

## Lifecycle and Security Invariants

- The sidecar owns live PTYs. Renderer-only restart should preserve them;
  sidecar exit intentionally ends them.
- Use `./start.sh` for the full app. `./start.sh --frontend` only works with a
  running gogoagent sidecar.
- The sidecar is loopback-only and authenticates every route except `/health`
  with a per-run token held by preload.
- Do not expose that token to the renderer, add permissive CORS, or restore a
  generic renderer-to-sidecar request bridge.
- New sidecar actions should receive a narrow named preload method and an
  explicit renderer type, not an arbitrary path/method escape hatch.

## Development Workflow

From the repository root:

```bash
corepack pnpm install
corepack pnpm typecheck
corepack pnpm --filter @gogoagent/desktop build
git diff --check
```

Before handoff, report the checks that passed and any lifecycle, migration, or
environment caveats. Preserve unrelated working-tree changes; do not reset or
delete them.
