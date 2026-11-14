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
  ./start.sh --remote HOST  Run Electron here, attached to HOST's sidecar over SSH.
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
  if ! command -v corepack >/dev/null 2>&1; then
    if [[ -t 0 && -t 1 ]]; then
      command -v npm >/dev/null 2>&1 \
        || fail "Corepack is required to run pnpm, and npm is not available to install it. Install Corepack, then rerun ./start.sh."

      printf 'gogoagent uses Corepack to run pnpm, but Corepack is not installed.\n'
      printf 'Install it now with npm install --global corepack@latest? [y/N] '
      local answer
      read -r answer
      case "$answer" in
        y|Y|yes|YES|Yes)
          info "Installing Corepack with npm..."
          npm install --global corepack@latest \
            || fail "Corepack installation failed. Correct the error above, then rerun ./start.sh."
          hash -r
          ;;
        *)
          fail "Corepack is required to run pnpm. Install it with: npm install --global corepack@latest"
          ;;
      esac
    else
      fail "Corepack is required to run pnpm. Install it with: npm install --global corepack@latest"
    fi
  fi

  command -v corepack >/dev/null 2>&1 \
    || fail "Corepack was installed, but it is not on PATH. Open a new terminal and rerun ./start.sh."
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

frontend_dependencies_resolve() {
  node -e '
    const { createRequire } = require("node:module")
    const path = require("node:path")
    createRequire(path.join(process.cwd(), "apps/desktop/package.json")).resolve("electron/package.json")
  ' >/dev/null 2>&1
}

require_frontend_install() {
  if [[ -d node_modules ]] && frontend_dependencies_resolve; then
    return
  fi
  info "Frontend dependencies are missing or incomplete; installing the desktop and phone UI now..."
  corepack pnpm install --filter @gogoagent/desktop... --filter @gogoagent/mobile... \
    || fail "Frontend dependency installation failed. Correct the error above, then rerun ./start.sh --remote."
  frontend_dependencies_resolve \
    || fail "Dependency installation completed, but Electron still cannot be resolved."
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
    if node -e '
      const { createRequire } = require("node:module")
      const path = require("node:path")
      const pty = createRequire(path.join(process.cwd(), "services/sidecar/package.json"))("node-pty")
      const child = pty.spawn(process.env.SHELL || "/bin/bash", ["-lc", "exit 0"], {
        name: "xterm-256color", cwd: process.cwd(), cols: 80, rows: 24, env: process.env,
      })
      child.onExit(({ exitCode }) => process.exit(exitCode))
    ' >/dev/null 2>&1; then
      return
    fi
    warn "node-pty's native binary cannot start a shell on this system."
  fi

  info "Rebuilding node-pty from source for ${platform}-${arch}..."
  npm_config_build_from_source=true corepack pnpm --filter @gogoagent/sidecar rebuild node-pty --pending \
    || fail "node-pty could not be built. On macOS, install Xcode Command Line Tools; on Linux, install standard C/C++ build tools and Python. Then rerun ./start.sh."

  node -e '
    const { createRequire } = require("node:module")
    const path = require("node:path")
    const pty = createRequire(path.join(process.cwd(), "services/sidecar/package.json"))("node-pty")
    const child = pty.spawn(process.env.SHELL || "/bin/bash", ["-lc", "exit 0"], {
      name: "xterm-256color", cwd: process.cwd(), cols: 80, rows: 24, env: process.env,
    })
    child.onExit(({ exitCode }) => process.exit(exitCode))
  ' >/dev/null 2>&1 \
    || fail "node-pty finished rebuilding, but it still cannot start a shell on this system."
}

electron_binary_ready() {
  node -e '
    const fs = require("node:fs")
    const { createRequire } = require("node:module")
    const path = require("node:path")
    const root = process.cwd()
    const binaryPath = createRequire(path.join(root, "apps/desktop/package.json"))("electron")
    if (!fs.existsSync(binaryPath)) process.exit(1)
    if (process.platform === "darwin") {
      const frameworkPath = path.resolve(path.dirname(binaryPath), "../Frameworks/Electron Framework.framework/Electron Framework")
      if (!fs.existsSync(frameworkPath)) process.exit(1)
    }
  ' >/dev/null 2>&1
}

repair_electron_install() {
  local electron_dir="$1"
  local platform_path

  case "$(uname -s)" in
    Darwin) platform_path="Electron.app/Contents/MacOS/Electron" ;;
    Linux) platform_path="electron" ;;
    *) return 0 ;;
  esac

  if [[ "$(uname -s)" == "Darwin" && -x "$electron_dir/dist/$platform_path" && ! -f "$electron_dir/dist/Electron.app/Contents/Frameworks/Electron Framework.framework/Electron Framework" ]]; then
    command -v unzip >/dev/null 2>&1 \
      || fail "Electron's app bundle is incomplete, and unzip is unavailable to repair it."
    warn "Electron's app bundle is incomplete; extracting the verified download again."
    local electron_zip
    electron_zip="$(cd "$electron_dir" && node -e "require('@electron/get').downloadArtifact({ version: require('./package.json').version, artifactName: 'electron', platform: process.platform, arch: process.arch, checksums: require('./checksums.json') }).then(console.log).catch((error) => { console.error(error); process.exit(1) })")" \
      || fail "Electron's download could not be located for repair."
    unzip -oq "$electron_zip" -d "$electron_dir/dist" \
      || fail "Electron's app bundle could not be extracted."
  fi

  if [[ -x "$electron_dir/dist/$platform_path" && ! -f "$electron_dir/path.txt" ]]; then
    warn "Electron's binary was extracted, but its path marker is missing; repairing it."
    printf '%s' "$platform_path" > "$electron_dir/path.txt" \
      || fail "Electron's binary is present, but its path marker could not be written."
  fi
}

require_electron_binary() {
  local electron_dir
  electron_dir="$(node -e "const { createRequire } = require('node:module'); const path = require('node:path'); const fromDesktop = createRequire(path.join(process.cwd(), 'apps/desktop/package.json')); console.log(path.dirname(fromDesktop.resolve('electron/package.json')))" 2>/dev/null)" \
    || fail "Electron is not installed. Rerun: corepack pnpm install"

  if electron_binary_ready; then
    return
  fi

  repair_electron_install "$electron_dir"
  if electron_binary_ready; then
    return
  fi

  info "Electron's application binary is missing; installing it now..."
  node "$electron_dir/install.js" \
    || fail "Electron's application binary could not be installed. Check the network error above, then rerun ./start.sh."

  repair_electron_install "$electron_dir"
  electron_binary_ready \
    || fail "Electron installation finished, but its application binary is still missing."
}

check_electron_sandbox() {
  [[ "$(uname -s)" == "Linux" ]] || return 0

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
elif [[ "${1:-}" == "--remote" ]]; then
  mode="remote"
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

if [[ "$mode" == "remote" ]]; then
  [[ $# -eq 1 ]] || fail "--remote needs one SSH host, such as user@server."
  require_node
  require_pnpm
  require_frontend_install
  require_electron_binary
  check_electron_sandbox
  exec node scripts/remote-frontend.mjs "$1"
fi

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

corepack pnpm build:ui
cd "$ROOT_DIR/apps/desktop"
exec node node_modules/electron/cli.js . "$@"
