#!/usr/bin/env bash
# Restore a Hustl snapshot into the running installation.
#
#   sudo /opt/hustl/restore.sh --check /opt/hustl/backups/hustl-2026-11-04.db
#   sudo /opt/hustl/restore.sh /opt/hustl/backups/hustl-2026-11-04.db
#
# The container is stopped before /data/hustl.db is replaced. The previous
# database is kept as hustl.db.before-<timestamp>.
set -euo pipefail

INSTALL_DIR="${HUSTL_DIR:-/opt/hustl}"
CONTAINER="${HUSTL_CONTAINER:-hustl}"

usage() {
  echo "Verwendung: $0 [--check] <snapshot.db>" >&2
  exit 2
}

MODE=restore
if [ "${1:-}" = "--check" ]; then
  MODE=check
  shift
fi
SNAPSHOT="${1:-}"
[ -n "$SNAPSHOT" ] || usage
[ -f "$SNAPSHOT" ] || { echo "Snapshot nicht gefunden: $SNAPSHOT" >&2; exit 1; }
[ -f "$INSTALL_DIR/docker-compose.yml" ] || { echo "Keine Installation in $INSTALL_DIR" >&2; exit 1; }

echo "==> Prüfe SQLite-Integrität"
docker run --rm \
  -v "$(cd "$(dirname "$SNAPSHOT")" && pwd):/backup:ro" \
  node:24-bookworm-slim \
  node -e '
    const fs = require("node:fs");
    const { DatabaseSync } = require("node:sqlite");
    fs.copyFileSync("/backup/" + process.argv[1], "/tmp/check.db");
    const db = new DatabaseSync("/tmp/check.db");
    const result = Object.values(db.prepare("PRAGMA integrity_check").get())[0];
    if (result !== "ok") {
      console.error("integrity_check:", result);
      process.exit(1);
    }
    for (const table of ["invoices", "offers", "expenses", "clients"]) {
      try {
        console.log(table + ":", db.prepare("SELECT count(*) AS n FROM " + table).get().n);
      } catch {
        console.log(table + ": (nicht vorhanden)");
      }
    }
  ' "$(basename "$SNAPSHOT")"

if [ "$MODE" = check ]; then
  echo "Prüfung bestanden — nichts verändert."
  exit 0
fi

echo "==> Stoppe Hustl"
docker compose -f "$INSTALL_DIR/docker-compose.yml" stop hustl

mkdir -p "$INSTALL_DIR/backups"
if [ -f "$INSTALL_DIR/data/hustl.db" ]; then
  mv "$INSTALL_DIR/data/hustl.db" "$INSTALL_DIR/backups/hustl.db.before-$(date +%Y%m%d%H%M%S)"
fi
rm -f "$INSTALL_DIR/data/hustl.db-wal" "$INSTALL_DIR/data/hustl.db-shm"

cp "$SNAPSHOT" "$INSTALL_DIR/data/hustl.db"
chown 10001:10001 "$INSTALL_DIR/data/hustl.db"
chmod 600 "$INSTALL_DIR/data/hustl.db"

echo "==> Starte Hustl"
docker compose -f "$INSTALL_DIR/docker-compose.yml" up -d hustl
echo "Restore abgeschlossen. Hinweis: Wiederhergestellt wurde nur die Datenbank; PDFs und Belege separat aus restic oder dem Vollarchiv einspielen."
