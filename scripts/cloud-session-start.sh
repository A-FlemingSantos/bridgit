#!/bin/bash
# Só em sessões na nuvem; localmente sai sem fazer nada
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0

# Roda em segundo plano (hook async): nada de entrada, saída só no log
exec < /dev/null >> /tmp/cloud-session-start.log 2>&1
echo "[$(date -Is)] início"

# Banco: dockerd + SQL Server + bridgit_db e bridgit_test (com limite de tempo)
if ! timeout 420 bash "$CLAUDE_PROJECT_DIR/scripts/bridgit-db-up.sh"; then
  echo "[$(date -Is)] bridgit-db-up.sh falhou ou expirou"
  exit 0
fi
echo "[$(date -Is)] banco pronto"

# Backend em segundo plano para o Flyway criar as tabelas do bridgit_db
if ! (exec 3<>/dev/tcp/127.0.0.1/8080) 2>/dev/null; then
  cd "$CLAUDE_PROJECT_DIR/services/api" || exit 0
  setsid nohup mvn -B -q spring-boot:run > /tmp/api.log 2>&1 < /dev/null &
  echo "[$(date -Is)] backend iniciado"
fi
exit 0
