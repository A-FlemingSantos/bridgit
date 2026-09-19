#!/usr/bin/env bash
# Runs the Bridgit Vite dev server for the Cloud Agent.
set -euo pipefail

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm use 24 >/dev/null

NODE24_BIN="$(dirname "$(nvm which 24)")"
export PATH="$NODE24_BIN:$PATH"

# Bind to all interfaces so the dev server is reachable inside the VM.
# vite.config.js reads VITE_DEV_HOST for the server host.
export VITE_DEV_HOST="${VITE_DEV_HOST:-0.0.0.0}"
exec npm run dev
