#!/usr/bin/env bash
# Idempotent bootstrap for the Bridgit Cloud Agent environment.
# The repo requires Node >=24 / npm >=11 (see package.json "engines").
set -euo pipefail

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  echo "nvm not found at $NVM_DIR; installing nvm..." >&2
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"

nvm install 24 >/dev/null
nvm alias default 24 >/dev/null

# Ensure the Node 24 toolchain wins over any other node on PATH.
NODE24_BIN="$(dirname "$(nvm which 24)")"
export PATH="$NODE24_BIN:$PATH"

echo "Using node $(node -v) / npm $(npm -v)"

npm ci
