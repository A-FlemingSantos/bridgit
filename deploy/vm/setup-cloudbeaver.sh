#!/usr/bin/env bash
# CloudBeaver (DBeaver web) na VM, para consultar o bridgit_db pelo navegador em qualquer PC.
# Executar NA VM, via SSH:  sudo bash setup-cloudbeaver.sh
#
# - Docker (pacote docker.io do Ubuntu) e imagem dbeaver/cloudbeaver com versao fixa.
# - Rede do host: o SQL Server escuta so em 127.0.0.1. A porta 8978 nao e exposta (o NSG libera so 22/80/443);
#   o acesso externo e pelo Caddy em https://db.bridgit-demo.duckdns.org.
# - Login SQL somente leitura `bridgit_readonly` (db_datareader no bridgit_db); senha em /etc/bridgit/sql-secrets.env.
# - Administrador do CloudBeaver criado na primeira subida; senha em /etc/bridgit/cloudbeaver.env (root).
#   Para ver:  sudo grep CB_ADMIN /etc/bridgit/cloudbeaver.env
# - Idempotente: segredos existentes sao mantidos.

set -euo pipefail
[[ $EUID -eq 0 ]] || exec sudo "$0" "$@"

IMAGE=dbeaver/cloudbeaver:26.2.1
NAME=cloudbeaver
WORKSPACE=/var/lib/cloudbeaver
CB_ENV=/etc/bridgit/cloudbeaver.env
SQL_ENV=/etc/bridgit/sql-secrets.env
SQLCMD=/opt/mssql-tools18/bin/sqlcmd
PUBLIC_URL=https://db.bridgit-demo.duckdns.org

log() { echo "==> $*"; }
gen() { echo "Bg9$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | cut -c1-25)"; }

[[ -f $SQL_ENV ]] || { echo "ERRO: $SQL_ENV nao existe (rode setup-sql.sh antes)." >&2; exit 1; }

if ! command -v docker >/dev/null; then
  log "Instalando Docker"
  DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 -y install docker.io
  systemctl enable --now docker
fi

# Login SQL somente leitura.
if ! grep -q '^BRIDGIT_READONLY_PASSWORD=' "$SQL_ENV"; then
  echo "BRIDGIT_READONLY_PASSWORD=$(gen)" >> "$SQL_ENV"
fi
# shellcheck disable=SC1090
. "$SQL_ENV"
log "Login bridgit_readonly (db_datareader)"
"$SQLCMD" -C -S 127.0.0.1 -U sa -P "$MSSQL_SA_PASSWORD" -b -Q "
IF SUSER_ID('bridgit_readonly') IS NULL
  CREATE LOGIN bridgit_readonly WITH PASSWORD = '$BRIDGIT_READONLY_PASSWORD', CHECK_POLICY = ON;
ELSE
  ALTER LOGIN bridgit_readonly WITH PASSWORD = '$BRIDGIT_READONLY_PASSWORD';
USE bridgit_db;
IF USER_ID('bridgit_readonly') IS NULL CREATE USER bridgit_readonly FOR LOGIN bridgit_readonly;
ALTER ROLE db_datareader ADD MEMBER bridgit_readonly;" >/dev/null

# Administrador e configuracao do CloudBeaver.
if [[ ! -f $CB_ENV ]]; then
  install -o root -g root -m 0600 /dev/null "$CB_ENV"
  cat >> "$CB_ENV" <<EOF
CB_SERVER_NAME=Bridgit
CB_SERVER_URL=$PUBLIC_URL
CB_ADMIN_NAME=bridgit-admin
CB_ADMIN_PASSWORD=$(gen)
CLOUDBEAVER_APP_ANONYMOUS_ACCESS_ENABLED=false
EOF
fi

# Conexao global pre-cadastrada (sem senha: informar a senha do bridgit_readonly na primeira conexao).
DS_DIR="$WORKSPACE/GlobalConfiguration/.dbeaver"
install -d -m 0755 "$DS_DIR"
if [[ ! -f $DS_DIR/data-sources.json ]]; then
  cat > "$DS_DIR/data-sources.json" <<'EOF'
{
  "folders": {},
  "connections": {
    "bridgit-db": {
      "provider": "sqlserver",
      "driver": "microsoft",
      "name": "Bridgit (produção, somente leitura)",
      "read-only": true,
      "configuration": {
        "host": "127.0.0.1",
        "port": "1433",
        "database": "bridgit_db",
        "url": "jdbc:sqlserver://127.0.0.1:1433;databaseName=bridgit_db;encrypt=true;trustServerCertificate=true",
        "user": "bridgit_readonly",
        "auth-model": "native",
        "type": "prod"
      }
    }
  }
}
EOF
fi

log "Subindo $IMAGE"
docker pull -q "$IMAGE" >/dev/null
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --restart unless-stopped --network host --memory 1g \
  --env-file "$CB_ENV" -v "$WORKSPACE:/opt/cloudbeaver/workspace" "$IMAGE" >/dev/null

for _ in $(seq 1 60); do
  curl -s -o /dev/null -m 3 http://127.0.0.1:8978/ && { log "CloudBeaver no ar em $PUBLIC_URL"; exit 0; }
  sleep 3
done
echo "ERRO: CloudBeaver nao respondeu em 127.0.0.1:8978 (docker logs $NAME)." >&2
exit 1
