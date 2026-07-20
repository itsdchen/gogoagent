#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${GOGOAGENT_PORT:-43111}"
SIDECAR_URL="http://127.0.0.1:${PORT}"

info() {
  printf '[gogoagent/start] %b\n' "$*"
}

warn() {
  printf '[gogoagent/start] warning: %b\n' "$*" >&2
}

fail() {
  printf '[gogoagent/start] error: %b\n' "$*" >&2
  exit 1
}

usage() {
  cat <<EOF
Usage:
  ./start.sh              Start the full dev app: desktop + sidecar.
  ./start.sh --frontend   Restart only Electron/frontend; requires an existing sidecar.
EOF
}

require_node() {
  command -v node >/dev/null 2>&1 || fail "Node.js is required, but node is not installed."

  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null)" \
    || fail "Could not determine the installed Node.js version."

  if ! [[ "$node_major" =~ ^[0-9]+$ ]]; then
    fail "Could not determine the installed Node.js version."
  fi

  if (( node_major < 20 )); then
    fail "Node $(node --version) is unsupported; gogoagent requires Node.js 20 or newer."
  fi
}

require_pnpm() {
  command -v corepack >/dev/null 2>&1 \
    || fail "corepack is required to run pnpm. Install Node.js with Corepack enabled."
  corepack pnpm --version >/dev/null 2>&1 \
    || fail "Corepack could not run pnpm. Try: corepack enable && corepack pnpm install"
}

require_install() {
  [[ -d node_modules ]] \
    || fail "Dependencies are not installed. Run: corepack pnpm install"
}

require_node_pty_binary() {
  local pty_dir
  local platform arch
  pty_dir="$(node -e "const { createRequire } = require('node:module'); const path = require('node:path'); const fromSidecar = createRequire(path.join(process.cwd(), 'services/sidecar/package.json')); console.log(path.dirname(fromSidecar.resolve('node-pty/package.json')))" 2>/dev/null)" \
    || fail "node-pty is not installed. Run: corepack pnpm install"
  platform="$(node -p 'process.platform')"
  arch="$(node -p 'process.arch')"

  if [[ -f "$pty_dir/build/Release/pty.node" || -f "$pty_dir/build/Debug/pty.node" || -f "$pty_dir/prebuilds/${platform}-${arch}/pty.node" ]]; then
    return
  fi

  fail "node-pty's native binary is missing for ${platform}-${arch}, so the sidecar cannot start. Rebuild its approved native dependency:\n  corepack pnpm rebuild node-pty\n\nIf that reports a compiler error on Linux, install your distribution's C/C++ build tools and Python, then rerun the rebuild."
}

check_electron_sandbox() {
  [[ "$(uname -s)" == "Linux" ]] || return

  local electron_dir
  electron_dir="$(node -e "const { createRequire } = require('node:module'); const path = require('node:path'); const fromDesktop = createRequire(path.join(process.cwd(), 'apps/desktop/package.json')); console.log(path.dirname(fromDesktop.resolve('electron/package.json')))" 2>/dev/null)" \
    || return
  local sandbox="$electron_dir/dist/chrome-sandbox"
  [[ -e "$sandbox" ]] || return

  local mode owner
  mode="$(stat -c '%a' "$sandbox" 2>/dev/null || true)"
  owner="$(stat -c '%u' "$sandbox" 2>/dev/null || true)"
  if [[ "$mode" != "4755" || "$owner" != "0" ]]; then
    warn "Electron's Linux sandbox helper is not root-owned with mode 4755. Electron may refuse to launch. If it does, run:\n  sudo chown root:root $sandbox\n  sudo chmod 4755 $sandbox"
  fi
}

preflight() {
  require_node
  require_pnpm
  require_install
  require_node_pty_binary
  check_electron_sandbox
}

mode="full"
if [[ "${1:-}" == "--frontend" ]]; then
  mode="frontend"
  shift
elif [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
elif [[ $# -gt 0 ]]; then
  usage >&2
  exit 2
fi

cd "$ROOT_DIR"

preflight

if [[ "$mode" == "full" ]]; then
  exec corepack pnpm --filter @gogoagent/desktop dev "$@"
fi

if ! node -e "fetch(process.argv[1]).then(async (r) => { const health = await r.json(); process.exit(r.ok && health.service === 'gogoagent-sidecar' ? 0 : 1) }).catch(() => process.exit(1))" "${SIDECAR_URL}/health"; then
  echo "No healthy gogoagent sidecar at ${SIDECAR_URL}." >&2
  echo "Run ./start.sh first, or restart only the frontend after an existing sidecar is running." >&2
  exit 1
fi

corepack pnpm --filter @gogoagent/desktop build
cd "$ROOT_DIR/apps/desktop"
exec node node_modules/electron/cli.js . "$@"
