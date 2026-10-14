#!/usr/bin/env bash
# Sobe o web (Vite dev server) a partir da raiz, como scripts/powershell/start-web-frontend.ps1.
# VITE_DEV_HOST e VITE_API_PROXY_TARGET podem vir do ambiente ou do .env da raiz.
set -euo pipefail

BRIDGIT_SCRIPT=web
# shellcheck source=scripts/dev/_common.sh
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

bridgit_load_env
bridgit_require_command npm "Node 24 ou mais novo"
bridgit_log 'run: npm run dev'
cd "$BRIDGIT_ROOT"
exec npm run dev -- "$@"
