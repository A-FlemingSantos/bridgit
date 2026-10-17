#!/usr/bin/env bash
# Publica o build do web (apps/web/dist empacotado em .tar.gz) na VM, servido pelo Caddy.
#
#   deploy-web.sh <tarball-no-servidor> <sha>
#   ex.: deploy-web.sh /tmp/web-1a2b3c4.tar.gz 1a2b3c4
#
# Extrai em /var/www/bridgit/releases/<sha>, confere o index.html e troca o symlink `current` atomicamente.
# Nao reinicia nada. Roda como o usuario `deploy` (dono de /var/www/bridgit) ou root. Mantem KEEP_RELEASES (3).

set -euo pipefail
umask 022

BASE_DIR=/var/www/bridgit
RELEASES_DIR="$BASE_DIR/releases"
CURRENT="$BASE_DIR/current"
KEEP_RELEASES="${KEEP_RELEASES:-3}"

log() { echo "[deploy-web] $*"; }
die() { echo "[deploy-web] ERRO: $*" >&2; exit 1; }

[[ $# -eq 2 ]] || die "uso: $0 <tarball-no-servidor> <sha>"
TARBALL="$1"
SHA="$2"
[[ "$SHA" =~ ^[0-9A-Fa-f]{7,64}$ ]] || die "sha invalido: $SHA"
[[ -f "$TARBALL" ]] || die "pacote nao encontrado: $TARBALL"
[[ -d "$RELEASES_DIR" ]] || die "$RELEASES_DIR nao existe (cloud-init concluido?)"

DEST="$RELEASES_DIR/$SHA"
TMP="$DEST.tmp"
rm -rf -- "$TMP"
mkdir -p "$TMP"
tar -xzf "$TARBALL" -C "$TMP"
[[ -f "$TMP/index.html" ]] || { rm -rf -- "$TMP"; die "pacote sem index.html na raiz"; }
chmod -R a+rX "$TMP"
rm -rf -- "$DEST"
mv "$TMP" "$DEST"

log "Apontando $CURRENT -> $DEST"
ln -sfn "$DEST" "$CURRENT.new"
mv -T "$CURRENT.new" "$CURRENT"
rm -f -- "$TARBALL"

# Poda: mantem as KEEP_RELEASES mais recentes, nunca a atual.
current_target="$(readlink "$CURRENT")"
find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d ! -name '*.tmp' -printf '%T@ %p\n' \
  | sort -rn | tail -n +$((KEEP_RELEASES + 1)) | cut -d' ' -f2- \
  | while IFS= read -r old; do
      [[ "$old" == "$current_target" ]] && continue
      log "Removendo release antiga $old"
      rm -rf -- "$old"
    done

log "Web publicado: $SHA"
