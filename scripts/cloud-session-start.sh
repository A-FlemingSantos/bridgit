#!/bin/bash
# Só em sessões na nuvem; localmente sai sem fazer nada
[ "$CLAUDE_CODE_REMOTE" = "true" ] || exit 0

# Banco: dockerd + SQL Server + bridgit_db e bridgit_test
bridgit-db-up || exit 0

# Backend em segundo plano para o Flyway criar as tabelas do bridgit_db
if ! (exec 3<>/dev/tcp/127.0.0.1/8080) 2>/dev/null; then
  cd "$CLAUDE_PROJECT_DIR/services/api" || exit 0
  setsid nohup mvn -B -q spring-boot:run > /tmp/api.log 2>&1 < /dev/null &
fi
exit 0
