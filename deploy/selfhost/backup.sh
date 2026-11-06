#!/usr/bin/env bash
# Daily Hustl backup: consistent SQLite snapshot inside the container, a copy
# outside the data directory, and optional restic if configured.
#
#   sudo /opt/hustl/backup.sh
#
# Optional offsite backup (restic must be installed and configured):
#   RESTIC_REPOSITORY=sftp:hustl-backup:/ RESTIC_PASSWORD_FILE=/etc/hustl/restic.pass \
#     /opt/hustl/backup.sh
set -euo pipefail

INSTALL_DIR="${HUSTL_DIR:-/opt/hustl}"
CONTAINER="${HUSTL_CONTAINER:-hustl}"
STAMP="$(date +%F)"

[ -f "$INSTALL_DIR/docker-compose.yml" ] || { echo "Keine Installation in $INSTALL_DIR" >&2; exit 1; }
mkdir -p "$INSTALL_DIR/backups"

echo "==> SQLite-Snapshot im Container"
docker exec "$CONTAINER" node dist/server/cli.mjs snapshot

echo "==> Verwaiste Dateien aufräumen (älter als 30 Tage)"
docker exec "$CONTAINER" node dist/server/cli.mjs cleanup --older-than 30

# The in-container snapshot lives in /data/backups. Copy it outside /data so a
# broken volume can be replaced without losing the last snapshot too.
latest="$(ls -1t "$INSTALL_DIR"/data/backups/hustl-*.db 2>/dev/null | head -n 1 || true)"
if [ -n "$latest" ]; then
  cp "$latest" "$INSTALL_DIR/backups/hustl-${STAMP}.db"
  echo "==> Kopie: $INSTALL_DIR/backups/hustl-${STAMP}.db"
else
  echo "Warnung: kein Snapshot gefunden." >&2
fi

if [ -n "${RESTIC_REPOSITORY:-}" ]; then
  command -v restic >/dev/null 2>&1 || { echo "restic ist nicht installiert." >&2; exit 1; }
  echo "==> Offsite-Backup mit restic"
  restic backup "$INSTALL_DIR/data" --tag hustl
  restic forget --tag hustl --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
  if [ "$(date +%u)" = 7 ]; then
    restic check --read-data-subset=5%
  fi
fi

find "$INSTALL_DIR/backups" -name 'hustl-*.db' -type f -mtime +14 -delete
echo "==> Fertig"
