#!/usr/bin/env bash
# Publica um jar da API na VM: guarda como release, troca o symlink atomicamente, reinicia o servico,
# espera a saude (UP) e, se falhar, volta para a release anterior.
#
#   deploy-api.sh <jar-no-servidor> <sha>
#   ex.: deploy-api.sh /tmp/api-1a2b3c4.jar 1a2b3c4
#
# Contrato com o CI: roda como o usuario `deploy` (ou root, em uso manual); o CI envia o jar para
# /tmp/api-<sha>.jar e este proprio script ao lado dele. Codigo de saida != 0 em qualquer falha.
#
# Variaveis opcionais: HEALTH_URL (http://127.0.0.1:8080/actuator/health), HEALTH_TIMEOUT (120, em s),
# KEEP_RELEASES (3), SERVICE (bridgit-api).

set -euo pipefail
umask 022

BASE_DIR=/opt/bridgit
RELEASES_DIR="$BASE_DIR/releases"
CURRENT="$BASE_DIR/current.jar"
SERVICE="${SERVICE:-bridgit-api}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8080/actuator/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"
KEEP_RELEASES="${KEEP_RELEASES:-3}"

log() { echo "[deploy-api] $*"; }
die() { echo "[deploy-api] ERRO: $*" >&2; exit 1; }

[[ $# -eq 2 ]] || die "uso: $0 <jar-no-servidor> <sha>"
JAR="$1"
SHA="$2"
[[ "$SHA" =~ ^[0-9A-Fa-f]{7,64}$ ]] || die "sha invalido: $SHA"
[[ -f "$JAR" ]] || die "jar nao encontrado: $JAR"
[[ -d "$RELEASES_DIR" ]] || die "$RELEASES_DIR nao existe (cloud-init concluido?)"

# Servico so e reiniciado via sudo quando nao somos root (sudoers do usuario deploy cobre isso).
SYSTEMCTL=(/usr/bin/systemctl)
[[ $EUID -eq 0 ]] || SYSTEMCTL=(sudo -n /usr/bin/systemctl)

# Evita dois deploys simultaneos.
LOCK="$BASE_DIR/.deploy.lock"
exec 9>"$LOCK"
chmod 0666 "$LOCK" 2>/dev/null || true # permite alternar entre root (manual) e deploy (CI)
flock -n 9 || die "outro deploy em andamento."

DEST="$RELEASES_DIR/api-$SHA.jar"
PREVIOUS=""
if [[ -L "$CURRENT" ]]; then PREVIOUS="$(readlink "$CURRENT")"; fi

swap_link() { # alvo
  ln -sfn "$1" "$CURRENT.new"
  mv -T "$CURRENT.new" "$CURRENT" # rename atomico sobre o symlink atual
}

wait_healthy() { # timeout em segundos
  local deadline=$((SECONDS + $1)) body
  while ((SECONDS < deadline)); do
    body="$(curl -s --max-time 3 "$HEALTH_URL" 2>/dev/null || true)"
    if [[ "$body" == *'"status":"UP"'* ]]; then return 0; fi
    sleep 3
  done
  return 1
}

show_logs() {
  echo "--- ultimas linhas do journal ($SERVICE) ---" >&2
  journalctl -u "$SERVICE" -n 40 --no-pager >&2 2>/dev/null || true
}

# 1) Guarda a release (copia + rename: nunca escreve por cima de um jar em uso).
log "Instalando release $DEST"
cp "$JAR" "$DEST.tmp"
chmod 0644 "$DEST.tmp"
mv -f "$DEST.tmp" "$DEST"

# 2) Troca o symlink e reinicia.
log "Apontando $CURRENT -> $DEST (anterior: ${PREVIOUS:-nenhum})"
swap_link "$DEST"
"${SYSTEMCTL[@]}" restart "$SERVICE"

# 3) Espera a saude.
log "Aguardando $HEALTH_URL (ate ${HEALTH_TIMEOUT}s)"
if wait_healthy "$HEALTH_TIMEOUT"; then
  log "API saudavel."
  rm -f -- "$JAR" 2>/dev/null || true
  # 4) Poda: mantem as KEEP_RELEASES mais recentes e nunca apaga a atual nem a anterior.
  current_target="$(readlink "$CURRENT")"
  while IFS= read -r old; do
    [[ "$old" == "$current_target" || "$old" == "$PREVIOUS" ]] && continue
    log "Removendo release antiga $old"
    rm -f -- "$old"
  done < <(ls -1t "$RELEASES_DIR"/api-*.jar 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)))
  log "Deploy concluido: api-$SHA"
  exit 0
fi

# Falha: rollback.
echo "[deploy-api] ERRO: API nao ficou saudavel em ${HEALTH_TIMEOUT}s." >&2
show_logs
if [[ -n "$PREVIOUS" && "$PREVIOUS" != "$DEST" && -f "$PREVIOUS" ]]; then
  log "Rollback para $PREVIOUS"
  swap_link "$PREVIOUS"
  "${SYSTEMCTL[@]}" restart "$SERVICE"
  if wait_healthy 60; then
    log "Rollback concluido; API saudavel na release anterior."
  else
    echo "[deploy-api] ERRO: API tambem nao ficou saudavel apos o rollback." >&2
    show_logs
  fi
else
  echo "[deploy-api] Sem release anterior para restaurar." >&2
fi
exit 1
