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
  ./start.sh --check      Install/repair dependencies and verify startup prerequisites.
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

install_dependencies() {
  info "$1"
  corepack pnpm install \
    || fail "Dependency installation failed. Correct the error above, then rerun ./start.sh."
}

dependencies_resolve() {
  node -e '
    const { createRequire } = require("node:module")
    const path = require("node:path")
    const root = process.cwd()
    createRequire(path.join(root, "services/sidecar/package.json")).resolve("node-pty/package.json")
    createRequire(path.join(root, "apps/desktop/package.json")).resolve("electron/package.json")
  ' >/dev/null 2>&1
}

require_install() {
  if [[ -d node_modules ]] && dependencies_resolve; then
    return
  fi
  install_dependencies "Dependencies are missing or incomplete; installing the workspace now..."
  dependencies_resolve \
    || fail "Dependency installation completed, but Electron or node-pty still cannot be resolved."
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

  info "node-pty's native binary is missing for ${platform}-${arch}; rebuilding it now..."
  corepack pnpm rebuild node-pty \
    || fail "node-pty could not be built. On Linux, install your distribution's C/C++ build tools and Python, then rerun ./start.sh."

  if [[ ! -f "$pty_dir/build/Release/pty.node" && ! -f "$pty_dir/build/Debug/pty.node" && ! -f "$pty_dir/prebuilds/${platform}-${arch}/pty.node" ]]; then
    fail "node-pty finished rebuilding, but its native binary is still missing for ${platform}-${arch}."
  fi
}

electron_binary_ready() {
  node -e '
    const fs = require("node:fs")
    const { createRequire } = require("node:module")
    const path = require("node:path")
    const root = process.cwd()
    const binaryPath = createRequire(path.join(root, "apps/desktop/package.json"))("electron")
    process.exit(fs.existsSync(binaryPath) ? 0 : 1)
  ' >/dev/null 2>&1
}

require_electron_binary() {
  local electron_dir
  electron_dir="$(node -e "const { createRequire } = require('node:module'); const path = require('node:path'); const fromDesktop = createRequire(path.join(process.cwd(), 'apps/desktop/package.json')); console.log(path.dirname(fromDesktop.resolve('electron/package.json')))" 2>/dev/null)" \
    || fail "Electron is not installed. Rerun: corepack pnpm install"

  if electron_binary_ready; then
    return
  fi

  info "Electron's application binary is missing; installing it now..."
  node "$electron_dir/install.js" \
    || fail "Electron's application binary could not be installed. Check the network error above, then rerun ./start.sh."

  electron_binary_ready \
    || fail "Electron installation finished, but its application binary is still missing."
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
  require_electron_binary
  check_electron_sandbox
}

mode="full"
if [[ "${1:-}" == "--frontend" ]]; then
  mode="frontend"
  shift
elif [[ "${1:-}" == "--check" ]]; then
  mode="check"
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

if [[ "$mode" == "check" ]]; then
  info "Startup prerequisites are ready. Run ./start.sh to launch gogoagent."
  exit 0
fi

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
