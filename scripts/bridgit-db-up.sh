#!/bin/bash
# Sobe o dockerd e o SQL Server (contêiner "mssql") e cria bridgit_db e bridgit_test.
# Idempotente e com limites de tempo: nunca fica em laço infinito.
: "${SPRING_DATASOURCE_PASSWORD:?SPRING_DATASOURCE_PASSWORD não definida}"

# dockerd: reinicia se morrer no meio (ex.: o daemon temporário do script de configuração,
# que ainda está encerrando quando a sessão começa). Exige duas respostas seguidas.
docker_ok=0
for i in $(seq 1 90); do
  if docker info >/dev/null 2>&1; then
    sleep 3
    if docker info >/dev/null 2>&1; then docker_ok=1; break; fi
  else
    pgrep -x dockerd >/dev/null || (nohup dockerd > /tmp/dockerd.log 2>&1 < /dev/null &)
    sleep 1
  fi
done
if [ "$docker_ok" != 1 ]; then
  echo "dockerd não subiu"; tail -20 /tmp/dockerd.log 2>/dev/null
  exit 1
fi

# Sessão retomada: o SQL Server já está de pé
docker ps --format '{{.Names}}' | grep -qx mssql && exit 0

docker rm -f mssql > /dev/null 2>&1
docker run -d --name mssql -p 1433:1433 -e ACCEPT_EULA=Y \
  -e MSSQL_SA_PASSWORD="$SPRING_DATASOURCE_PASSWORD" \
  mcr.microsoft.com/mssql/server:2022-latest > /dev/null || exit 1

SQLCMD=(docker exec mssql /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$SPRING_DATASOURCE_PASSWORD")
sql_ok=0
for i in $(seq 1 90); do
  if "${SQLCMD[@]}" -Q "SELECT 1" > /dev/null 2>&1; then sql_ok=1; break; fi
  docker ps --format '{{.Names}}' | grep -qx mssql || break   # o contêiner morreu
  sleep 2
done
if [ "$sql_ok" != 1 ]; then
  echo "SQL Server não respondeu"; docker logs --tail 20 mssql 2>&1
  exit 1
fi

"${SQLCMD[@]}" -Q "IF DB_ID('bridgit_db') IS NULL CREATE DATABASE bridgit_db; IF DB_ID('bridgit_test') IS NULL CREATE DATABASE bridgit_test"
