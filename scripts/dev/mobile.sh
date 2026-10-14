#!/usr/bin/env bash
# Sobe o Metro do app mobile (expo start), como scripts/powershell/start-mobile-*-expo.ps1.
#
# Uso: bash scripts/dev/mobile.sh [--dev-client] [--android] [--web] [--port N]
#   --dev-client  usa o development build (expo start --dev-client); sem isso, usa o Expo Go (--go)
#   --android     abre no Android conectado/emulador (expo start --android)
#   --web         roda o app no navegador (porta 8081, como "npm run mobile:web"); não combina com --dev-client
#   --port N      porta do Metro (padrão 8082 no Android/Expo Go; 8081 no web)
#
# O app monta o endereço da API a partir do IP anunciado pelo Metro. Só defina EXPO_PUBLIC_API_BASE_URL
# para sobrescrever isso. Se o IP do PC mudar (outra rede, nova concessão do roteador), reinicie o Metro.
set -euo pipefail

BRIDGIT_SCRIPT=mobile
# shellcheck source=scripts/dev/_common.sh
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

dev_client=0
android=0
web=0
port=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dev-client) dev_client=1 ;;
    --android) android=1 ;;
    --web) web=1 ;;
    --port)
      [ "$#" -ge 2 ] || bridgit_die '--port exige um número'
      port="$2"; shift ;;
    -h|--help) sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) bridgit_die "opção desconhecida: $1 (use --help)" ;;
  esac
  shift
done

if [ "$web" = 1 ] && [ "$dev_client" = 1 ]; then bridgit_die '--web não combina com --dev-client'; fi
if [ -n "$port" ] && ! [[ "$port" =~ ^[0-9]+$ ]]; then bridgit_die "porta inválida: $port"; fi

bridgit_load_env
bridgit_require_command npx "Node 24 ou mais novo"

args=(expo start)
if [ "$web" = 1 ]; then
  args+=(--web --port "${port:-8081}")
  # No navegador, "localhost" é o próprio PC; sem URL configurada, usa a API local.
  export EXPO_PUBLIC_API_BASE_URL="${EXPO_PUBLIC_API_BASE_URL:-http://localhost:8080}"
else
  args+=(--port "${port:-8082}")
  if [ "$dev_client" = 1 ]; then args+=(--dev-client); else args+=(--go); fi
  if [ "$android" = 1 ]; then args+=(--android); fi
fi

if [ -n "${EXPO_PUBLIC_API_BASE_URL:-}" ]; then
  EXPO_PUBLIC_API_BASE_URL="${EXPO_PUBLIC_API_BASE_URL%/}"
  export EXPO_PUBLIC_API_BASE_URL
  bridgit_log "api_base_url=$EXPO_PUBLIC_API_BASE_URL"
else
  bridgit_log 'api_base_url=auto (host do Expo, porta 8080)'
fi
bridgit_log "run: npx ${args[*]}"
cd "$BRIDGIT_ROOT/apps/mobile"
exec npx "${args[@]}"
