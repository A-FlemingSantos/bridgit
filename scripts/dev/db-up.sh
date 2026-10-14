#!/usr/bin/env bash
# Sobe o SQL Server local em Docker (contêiner "mssql", porta 1433) e cria bridgit_db e bridgit_test.
# Reaproveita scripts/bridgit-db-up.sh; se o contêiner já existe parado, só o religa (sem perder dados).
# Exige SPRING_DATASOURCE_PASSWORD (no ambiente ou no .env da raiz).
set -euo pipefail

BRIDGIT_SCRIPT=db-up
# shellcheck source=scripts/dev/_common.sh
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

bridgit_load_env
bridgit_require_command docker "o banco local roda em Docker"
bridgit_require_vars SPRING_DATASOURCE_PASSWORD

# Contêiner existente e parado (ex.: depois de reiniciar o PC): religa em vez de recriar.
if docker info >/dev/null 2>&1 \
  && docker ps -a --format '{{.Names}}' | grep -qx mssql \
  && ! docker ps --format '{{.Names}}' | grep -qx mssql; then
  bridgit_log 'religando o contêiner mssql existente'
  docker start mssql >/dev/null
  for _ in $(seq 1 60); do
    if docker exec mssql /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa \
      -P "$SPRING_DATASOURCE_PASSWORD" -Q 'SELECT 1' >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
fi

bash "$BRIDGIT_ROOT/scripts/bridgit-db-up.sh"
bridgit_log 'SQL Server em localhost:1433 com bridgit_db e bridgit_test'
