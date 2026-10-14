#!/usr/bin/env bash
# Sobe a API (Spring Boot) com mvn spring-boot:run, como scripts/powershell/start-web-backend.ps1.
# Exige SPRING_DATASOURCE_PASSWORD e APP_JWT_SECRET (no ambiente ou no .env da raiz).
#
# Opções:
#   --shared    libera no CORS também o Expo web (localhost e 127.0.0.1, porta 8081), como start-shared-backend.ps1
#   --expo-go   acrescenta exp:// aos redirecionamentos móveis, para o retorno do consentimento no Expo Go
#
# Variáveis opcionais: DB_HOST e DB_PORT (padrão localhost e 1433) para a checagem do banco; se mudarem
# e SPRING_DATASOURCE_URL não estiver definida, a URL JDBC é montada com eles.
set -euo pipefail

BRIDGIT_SCRIPT=api
# shellcheck source=scripts/dev/_common.sh
. "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

shared=0
expo_go=0
for arg in "$@"; do
  case "$arg" in
    --shared) shared=1 ;;
    --expo-go) expo_go=1 ;;
    -h|--help) sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) bridgit_die "opção desconhecida: $arg (use --shared, --expo-go ou --help)" ;;
  esac
done

bridgit_load_env
bridgit_require_command mvn "Maven 3.9 ou mais novo"
bridgit_require_command java "Java 21"
bridgit_require_vars SPRING_DATASOURCE_PASSWORD APP_JWT_SECRET

if [ -z "${APP_INTEGRATION_TOKEN_KEY_B64:-}" ]; then
  bridgit_log 'aviso: APP_INTEGRATION_TOKEN_KEY_B64 não definida; a conexão com provedores não vai funcionar (gere com: openssl rand -base64 32)'
fi

export SPRING_DATASOURCE_USERNAME="${SPRING_DATASOURCE_USERNAME:-sa}"
export APP_FRONTEND_BASE_URL="${APP_FRONTEND_BASE_URL:-http://localhost:5173}"
export APP_ONEDRIVE_REDIRECT_URI="${APP_ONEDRIVE_REDIRECT_URI:-http://localhost:8080/api/providers/onedrive/callback}"
export APP_GOOGLE_DRIVE_REDIRECT_URI="${APP_GOOGLE_DRIVE_REDIRECT_URI:-http://localhost:8080/api/providers/google-drive/callback}"
export APP_DROPBOX_REDIRECT_URI="${APP_DROPBOX_REDIRECT_URI:-http://localhost:8080/api/providers/dropbox/callback}"

cors="${APP_CORS_ALLOWED_ORIGINS:-http://localhost:5173}"
if [ "$shared" = 1 ]; then
  for origin in http://localhost:8081 http://127.0.0.1:8081; do
    case ",$cors," in *",$origin,"*) ;; *) cors="$cors,$origin" ;; esac
  done
fi
export APP_CORS_ALLOWED_ORIGINS="$cors"

prefixes="${APP_MOBILE_REDIRECT_PREFIXES:-bridgit://}"
if [ "$expo_go" = 1 ]; then
  case ",$prefixes," in *",exp://,"*) ;; *) prefixes="$prefixes,exp://" ;; esac
fi
export APP_MOBILE_REDIRECT_PREFIXES="$prefixes"

# O banco precisa estar escutando; se faltar bridgit_db, tenta criar.
db_host="${DB_HOST:-localhost}"
db_port="${DB_PORT:-1433}"
if [ -z "${SPRING_DATASOURCE_URL:-}" ] && { [ "$db_host" != localhost ] || [ "$db_port" != 1433 ]; }; then
  export SPRING_DATASOURCE_URL="jdbc:sqlserver://$db_host:$db_port;databaseName=bridgit_db;encrypt=false;trustServerCertificate=true"
fi
if ! (exec 3<>"/dev/tcp/$db_host/$db_port") 2>/dev/null; then
  bridgit_die "o SQL Server não está escutando em $db_host:$db_port. Suba o banco com: bash scripts/dev/db-up.sh"
fi
set +e
bridgit_sqlcmd -Q "IF DB_ID('bridgit_db') IS NULL CREATE DATABASE bridgit_db" >/dev/null 2>&1
status=$?
set -e
case "$status" in
  0) ;;
  127) bridgit_log "aviso: sem sqlcmd (nem contêiner mssql) para conferir o banco; confirme que bridgit_db existe em $db_host:$db_port" ;;
  *) bridgit_die "não consegui conectar ou criar bridgit_db em $db_host:$db_port; confira SPRING_DATASOURCE_USERNAME e SPRING_DATASOURCE_PASSWORD" ;;
esac

bridgit_log "web_url=$APP_FRONTEND_BASE_URL cors=$APP_CORS_ALLOWED_ORIGINS mobile_redirect=$APP_MOBILE_REDIRECT_PREFIXES"
bridgit_log 'run: mvn spring-boot:run'
cd "$BRIDGIT_ROOT/services/api"
exec mvn spring-boot:run
