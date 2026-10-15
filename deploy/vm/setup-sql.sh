#!/usr/bin/env bash
# Configura o SQL Server 2025 Express na VM (executar NA VM, via SSH, pelo operador).
#
#   sudo ./setup-sql.sh [--accept-eula]
#
# - Senhas: variaveis MSSQL_SA_PASSWORD e BRIDGIT_APP_PASSWORD, ou digitadas (sem eco). Nunca sao impressas.
# - EULA: nada e aceito no boot. O `mssql-conf setup` e a instalacao do mssql-tools18 (sqlcmd) so rodam se o
#   operador aceitar explicitamente (--accept-eula ou ACCEPT_EULA=Y). Quando ja estao instalados/configurados
#   (execucoes seguintes), a flag nao e necessaria.
# - Faz: setup Express, memory.memorylimitmb=2048, escuta so em 127.0.0.1, banco bridgit_db,
#   login/usuario bridgit_app (db_owner) e backup diario em cron (/var/backups/bridgit, ultimos 3).
# - Idempotente: pode ser repetido; a senha do bridgit_app e sincronizada com a informada.
#
# A senha do bridgit_app deve ter 12+ caracteres, atender a politica do SQL Server (3 de 4: maiuscula,
# minuscula, digito, simbolo) e usar apenas A-Z a-z 0-9 _ - . @ % ^ * + = : , (para caber sem escape no api.env).
# Sugestao: openssl rand -base64 24 | tr -d '/+=' | cut -c1-24   (alfanumerica; confira se tem maiuscula, minuscula e digito)

set -euo pipefail

# Re-executa como root preservando apenas as variaveis necessarias (antes de qualquer prompt).
if [[ $EUID -ne 0 ]]; then
  exec sudo --preserve-env=MSSQL_SA_PASSWORD,BRIDGIT_APP_PASSWORD,ACCEPT_EULA "$0" "$@"
fi

SQLCMD=/opt/mssql-tools18/bin/sqlcmd
MSSQL_CONF=/opt/mssql/bin/mssql-conf
MSSQL_CONF_FILE=/var/opt/mssql/mssql.conf
DB_NAME=bridgit_db
APP_LOGIN=bridgit_app
MEMORY_LIMIT_MB=2048
BACKUP_DIR=/var/backups/bridgit
BACKUP_KEEP=3
BACKUP_SCRIPT=/usr/local/sbin/bridgit-backup.sh
BACKUP_ENV=/etc/bridgit/sql-backup.env
BACKUP_CRON=/etc/cron.d/bridgit-backup

die() { echo "ERRO: $*" >&2; exit 1; }
log() { echo "==> $*"; }

ACCEPT=0
[[ "${ACCEPT_EULA:-}" == "Y" ]] && ACCEPT=1
for arg in "$@"; do
  case "$arg" in
    --accept-eula) ACCEPT=1 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) die "argumento desconhecido: $arg" ;;
  esac
done

[[ -x "$MSSQL_CONF" ]] || die "mssql-server nao instalado. O cloud-init terminou? (cloud-init status --wait)"

# sqlcmd (mssql-tools18 + msodbcsql18): o cloud-init so registra o repositorio; instalar exige aceitar o EULA.
if [[ ! -x "$SQLCMD" ]]; then
  [[ $ACCEPT -eq 1 ]] || die "mssql-tools18 (sqlcmd) ainda nao instalado. Reexecute com --accept-eula (ou ACCEPT_EULA=Y) para aceitar os EULAs das ferramentas e do driver ODBC: https://aka.ms/useterms"
  log "Instalando mssql-tools18 (EULA aceito via flag)"
  export DEBIAN_FRONTEND=noninteractive
  apt-get -o DPkg::Lock::Timeout=300 update
  ACCEPT_EULA=Y apt-get -o DPkg::Lock::Timeout=300 -y install mssql-tools18
  [[ -x "$SQLCMD" ]] || die "mssql-tools18 instalado, mas $SQLCMD nao existe."
fi

# --- Senhas -----------------------------------------------------------------------------------
read_secret() { # var prompt
  local var="$1" prompt="$2" a b
  if [[ -n "${!var:-}" ]]; then return; fi
  [[ -t 0 ]] || die "$var nao definida e nao ha terminal para pedir."
  read -rsp "$prompt: " a; echo
  read -rsp "Confirme: " b; echo
  [[ "$a" == "$b" ]] || die "as senhas nao conferem."
  printf -v "$var" '%s' "$a"
}
read_secret MSSQL_SA_PASSWORD "Senha do SA"
read_secret BRIDGIT_APP_PASSWORD "Senha do login $APP_LOGIN"

[[ ${#MSSQL_SA_PASSWORD} -ge 12 ]] || die "senha do SA com menos de 12 caracteres."
[[ ${#BRIDGIT_APP_PASSWORD} -ge 12 ]] || die "senha do $APP_LOGIN com menos de 12 caracteres."
[[ "$BRIDGIT_APP_PASSWORD" =~ ^[A-Za-z0-9_.@%^*+=:,-]+$ ]] || die "senha do $APP_LOGIN com caractere fora de A-Z a-z 0-9 _ - . @ % ^ * + = : ,"

# sqlcmd le a senha de SQLCMDPASSWORD (nao aparece em ps). -C confia no certificado autoassinado local.
sql() { SQLCMDPASSWORD="$MSSQL_SA_PASSWORD" "$SQLCMD" -S 127.0.0.1 -U sa -C -b -x "$@"; }
sql_ready() { sql -Q "SELECT 1" >/dev/null 2>&1; }
wait_ready() { # segundos
  local i
  for ((i = 0; i < $1; i += 2)); do sql_ready && return 0; sleep 2; done
  return 1
}

# --- Setup do SQL Server (Express) ------------------------------------------------------------
if grep -qiE '^accepteula *= *Y' "$MSSQL_CONF_FILE" 2>/dev/null; then
  log "SQL Server ja configurado; pulando mssql-conf setup"
else
  [[ $ACCEPT -eq 1 ]] || die "SQL Server ainda nao configurado. Reexecute com --accept-eula (ou ACCEPT_EULA=Y) para aceitar o EULA do SQL Server Express: https://aka.ms/useterms"
  log "Executando mssql-conf setup (edition Express)"
  MSSQL_SA_PASSWORD="$MSSQL_SA_PASSWORD" MSSQL_PID=Express "$MSSQL_CONF" -n setup accept-eula
fi
systemctl enable mssql-server >/dev/null 2>&1 || true

# --- Memoria e escuta apenas em localhost -----------------------------------------------------
restart_needed=0
if ! grep -qE "^memorylimitmb *= *$MEMORY_LIMIT_MB\$" "$MSSQL_CONF_FILE" 2>/dev/null; then
  log "memory.memorylimitmb = $MEMORY_LIMIT_MB"
  "$MSSQL_CONF" set memory.memorylimitmb "$MEMORY_LIMIT_MB"
  restart_needed=1
fi
if ! grep -qE '^ipaddress *= *127\.0\.0\.1$' "$MSSQL_CONF_FILE" 2>/dev/null; then
  log "network.ipaddress = 127.0.0.1"
  "$MSSQL_CONF" set network.ipaddress 127.0.0.1
  restart_needed=1
fi
if [[ $restart_needed -eq 1 ]]; then
  log "Reiniciando mssql-server"
  systemctl restart mssql-server
fi

log "Aguardando o SQL Server aceitar conexoes"
if ! wait_ready 90; then
  if grep -qE '^ipaddress *= *127\.0\.0\.1$' "$MSSQL_CONF_FILE" 2>/dev/null; then
    echo "AVISO: sem conexao com network.ipaddress=127.0.0.1; revertendo (a porta 1433 continua fechada pelo NSG)." >&2
    "$MSSQL_CONF" unset network.ipaddress
    systemctl restart mssql-server
    wait_ready 90 || die "SQL Server nao respondeu. Veja: journalctl -u mssql-server -n 100 --no-pager"
  else
    die "SQL Server nao respondeu. Veja: journalctl -u mssql-server -n 100 --no-pager"
  fi
fi

# --- Banco, login e usuario -------------------------------------------------------------------
log "Criando banco $DB_NAME, login e usuario $APP_LOGIN (db_owner)"
pw_sql="${BRIDGIT_APP_PASSWORD//\'/\'\'}"
sql <<SQL
IF DB_ID(N'$DB_NAME') IS NULL CREATE DATABASE [$DB_NAME];
GO
IF SUSER_ID(N'$APP_LOGIN') IS NULL
    CREATE LOGIN [$APP_LOGIN] WITH PASSWORD = N'$pw_sql', CHECK_POLICY = ON, DEFAULT_DATABASE = [$DB_NAME];
ELSE
    ALTER LOGIN [$APP_LOGIN] WITH PASSWORD = N'$pw_sql';
GO
USE [$DB_NAME];
IF USER_ID(N'$APP_LOGIN') IS NULL CREATE USER [$APP_LOGIN] FOR LOGIN [$APP_LOGIN];
ALTER ROLE db_owner ADD MEMBER [$APP_LOGIN];
GO
SQL

# O login da aplicacao realmente entra?
SQLCMDPASSWORD="$BRIDGIT_APP_PASSWORD" "$SQLCMD" -S 127.0.0.1 -U "$APP_LOGIN" -d "$DB_NAME" -C -b -Q "SELECT 1" >/dev/null \
  || die "login $APP_LOGIN nao conseguiu conectar em $DB_NAME."

# --- Backup diario ----------------------------------------------------------------------------
log "Configurando backup diario em $BACKUP_DIR (ultimos $BACKUP_KEEP)"
install -d -o mssql -g mssql -m 0750 "$BACKUP_DIR"
[[ -d /etc/bridgit ]] || install -d -o root -g bridgit -m 0750 /etc/bridgit # normalmente criado pelo cloud-init
( umask 077; printf "SQLCMDPASSWORD='%s'\n" "$BRIDGIT_APP_PASSWORD" > "$BACKUP_ENV" )
chown root:root "$BACKUP_ENV"; chmod 0600 "$BACKUP_ENV"

cat >"$BACKUP_SCRIPT" <<'SCRIPT'
#!/usr/bin/env bash
# Backup completo do bridgit_db. Gerado por deploy/vm/setup-sql.sh.
set -euo pipefail
BACKUP_DIR=/var/backups/bridgit
KEEP=3
# shellcheck disable=SC1091
. /etc/bridgit/sql-backup.env
export SQLCMDPASSWORD
file="$BACKUP_DIR/bridgit_db_$(date -u +%Y%m%dT%H%M%SZ).bak"
/opt/mssql-tools18/bin/sqlcmd -S 127.0.0.1 -U bridgit_app -d bridgit_db -C -b \
  -Q "BACKUP DATABASE [bridgit_db] TO DISK = N'$file' WITH INIT, CHECKSUM, STATS = 10"
gzip -f "$file"
# mantem so os KEEP mais recentes
ls -1t "$BACKUP_DIR"/bridgit_db_*.bak.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f --
echo "$(date -u +%FT%TZ) backup ok: $file.gz"
SCRIPT
chmod 0750 "$BACKUP_SCRIPT"; chown root:root "$BACKUP_SCRIPT"

printf '%s\n' \
  '# Backup diario do bridgit_db (03:30 UTC). Gerado por setup-sql.sh.' \
  "30 3 * * * root $BACKUP_SCRIPT >> /var/log/bridgit-backup.log 2>&1" > "$BACKUP_CRON"
chmod 0644 "$BACKUP_CRON"

log "Rodando um backup de teste"
"$BACKUP_SCRIPT"

cat <<EOF

SQL Server pronto.
  Banco : $DB_NAME
  Login : $APP_LOGIN (db_owner)  - use a mesma senha em SPRING_DATASOURCE_PASSWORD (/etc/bridgit/api.env)
  Escuta: $(ss -ltn 2>/dev/null | awk '$4 ~ /:1433$/ {print $4}' | paste -sd' ' -)
  Backup: $BACKUP_DIR (diario 03:30 UTC, ultimos $BACKUP_KEEP). Fica no mesmo disco: copie periodicamente para fora da VM.
EOF
