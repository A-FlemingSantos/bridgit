#!/usr/bin/env bash
# Funções comuns dos scripts de scripts/dev. Este arquivo é carregado com "source", não executado.

BRIDGIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

bridgit_log() { printf '[%s] %s\n' "${BRIDGIT_SCRIPT:-bridgit}" "$*"; }
bridgit_die() { printf '[%s] erro: %s\n' "${BRIDGIT_SCRIPT:-bridgit}" "$*" >&2; exit 1; }

# Exige um comando no PATH, com a dica de instalação.
bridgit_require_command() {
  command -v "$1" >/dev/null 2>&1 || bridgit_die "comando obrigatório não encontrado no PATH: $1${2:+ ($2)}"
}

# Lê o .env da raiz (se existir) e exporta o que ainda não estiver definido no processo.
# Não usa "source": valores como a URL JDBC têm ";" e seriam executados como comandos.
# Aceita linhas CHAVE=valor, com ou sem aspas ao redor do valor; ignora comentários e linhas vazias.
bridgit_load_env() {
  local file="$BRIDGIT_ROOT/.env" line key value
  [ -f "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in ''|'#'*) continue ;; esac
    key="${line%%=*}"
    value="${line#*=}"
    key="${key#export }"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [[ "$value" =~ ^\"(.*)\"$ ]] || [[ "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
    # Variável já definida (mesmo vazia) no processo tem prioridade sobre o arquivo.
    if [ -z "${!key+x}" ]; then export "$key=$value"; fi
  done < "$file"
}

# Exige variáveis de ambiente não vazias.
bridgit_require_vars() {
  local name missing=0
  for name in "$@"; do
    if [ -z "${!name:-}" ]; then
      printf '[%s] erro: %s não está definida. Defina no ambiente ou no .env da raiz (veja .env.example).\n' \
        "${BRIDGIT_SCRIPT:-bridgit}" "$name" >&2
      missing=1
    fi
  done
  [ "$missing" = 0 ] || exit 1
}

# Roda um comando SQL no banco: sqlcmd local, ou o sqlcmd do contêiner "mssql" criado por db-up.sh.
# Devolve 127 se nenhum dos dois estiver disponível.
bridgit_sqlcmd() {
  local host="${DB_HOST:-localhost}" port="${DB_PORT:-1433}" user="${SPRING_DATASOURCE_USERNAME:-sa}"
  if command -v sqlcmd >/dev/null 2>&1; then
    sqlcmd -C -S "$host,$port" -U "$user" -P "$SPRING_DATASOURCE_PASSWORD" -b "$@"
  elif command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx mssql; then
    docker exec mssql /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U "$user" -P "$SPRING_DATASOURCE_PASSWORD" -b "$@"
  else
    return 127
  fi
}
