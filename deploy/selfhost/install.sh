#!/usr/bin/env bash
# Hustl self-host installer for a Debian/Ubuntu VPS.
#
#   sudo ./deploy/selfhost/install.sh
#
# Non-interactive:
#   sudo HUSTL_DOMAIN=hustl.example.com ACME_EMAIL=du@example.com \
#        HUSTL_ASSUME_YES=1 ./deploy/selfhost/install.sh
#
# Re-run the same command to rebuild and update. Data and .env stay untouched.
set -euo pipefail

ORIGINAL_ARGS=("$@")
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALL_DIR="${HUSTL_DIR:-/opt/hustl}"
ENV_FILE="$INSTALL_DIR/.env"
MODE="${HUSTL_PROXY:-auto}"
ASSUME_YES="${HUSTL_ASSUME_YES:-0}"
RECONFIGURE=0

log()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m ok \033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWarnung:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mFehler:\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Hustl auf einem eigenen VPS installieren.

  sudo ./deploy/selfhost/install.sh [Optionen]

Optionen:
  --bundled       Caddy aus diesem Stack mitinstallieren (80/443 müssen frei sein)
  --external      Bestehenden Caddy/Nginx auf dem Host weiterverwenden
  --reconfigure   Domain/E-Mail neu abfragen (Daten bleiben erhalten)
  --yes           Keine Rückfragen; fehlende Pflichtwerte kommen aus der Umgebung
  -h, --help      Diese Hilfe

Umgebung:
  HUSTL_DOMAIN      z. B. hustl.example.com
  ACME_EMAIL        E-Mail für Let's Encrypt
  HUSTL_PROXY       bundled | external | auto (Standard: auto)
  HUSTL_DIR         Installationsverzeichnis (Standard: /opt/hustl)
  HUSTL_PORT        Lokaler Port im external-Modus (Standard: 3000)
  PROXY_NETWORK     Docker-Netz für einen Caddy-Container (Standard: hustl-proxy)
  HUSTL_ASSUME_YES  1 = keine Rückfragen
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --bundled) MODE=bundled ;;
    --external) MODE=external ;;
    --reconfigure) RECONFIGURE=1 ;;
    --yes) ASSUME_YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unbekannte Option: $1" ;;
  esac
  shift
done

if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null 2>&1 || die "Bitte als root ausführen."
  log "Starte mit sudo neu ..."
  exec sudo -E bash "$0" "${ORIGINAL_ARGS[@]}"
fi

if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  log "System: ${PRETTY_NAME:-Linux} ($(uname -m))"
fi

read_env() {
  local key="$1"
  [ -f "$ENV_FILE" ] || return 0
  sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1
}

ask() {
  # ask <variable> <prompt> [default]
  local name="$1" prompt="$2" default="${3:-}" answer=""
  if [ -n "${!name:-}" ]; then return 0; fi
  if [ "$ASSUME_YES" = 1 ] || [ ! -t 0 ]; then
    [ -n "$default" ] || die "$name fehlt. Setze die Umgebungsvariable oder starte interaktiv."
    printf -v "$name" '%s' "$default"
    return 0
  fi
  if [ -n "$default" ]; then
    read -r -p "$prompt [$default]: " answer
    answer="${answer:-$default}"
  else
    read -r -p "$prompt: " answer
  fi
  [ -n "$answer" ] || die "$name darf nicht leer sein."
  printf -v "$name" '%s' "$answer"
}

if [ -f "$ENV_FILE" ] && [ "$RECONFIGURE" -ne 1 ]; then
  HUSTL_DOMAIN="${HUSTL_DOMAIN:-$(read_env HUSTL_DOMAIN)}"
  ACME_EMAIL="${ACME_EMAIL:-$(read_env ACME_EMAIL)}"
  if [ "$MODE" = auto ]; then
    MODE="$(read_env HUSTL_PROXY)"
    MODE="${MODE:-auto}"
  fi
  if [ -z "${HUSTL_PORT:-}" ]; then
    HUSTL_PORT="$(read_env HUSTL_PORT)"
  fi
  if [ -z "${PROXY_NETWORK:-}" ]; then
    PROXY_NETWORK="$(read_env PROXY_NETWORK)"
  fi
  TZ_VALUE="$(read_env TZ)"
  log "Bestehende Installation gefunden: $HUSTL_DOMAIN"
else
  TZ_VALUE="${TZ:-Europe/Berlin}"
  ask HUSTL_DOMAIN "Domain ohne https:// (z. B. hustl.example.com)"
  ask ACME_EMAIL "E-Mail für Let's Encrypt"
fi

HUSTL_DOMAIN="${HUSTL_DOMAIN,,}"
HUSTL_DOMAIN="${HUSTL_DOMAIN#https://}"
HUSTL_DOMAIN="${HUSTL_DOMAIN#http://}"
HUSTL_DOMAIN="${HUSTL_DOMAIN%/}"

[[ "$HUSTL_DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$ ]] \
  || die "Ungültige Domain: $HUSTL_DOMAIN (erwartet z. B. hustl.example.com)"
[[ "$ACME_EMAIL" == *@*.* ]] || die "Ungültige E-Mail: $ACME_EMAIL"

# --- Docker -----------------------------------------------------------------
if ! command -v curl >/dev/null 2>&1; then
  log "Installiere curl ..."
  apt-get update -qq
  apt-get install -y -qq curl ca-certificates
fi

if ! command -v git >/dev/null 2>&1; then
  log "Installiere git ..."
  apt-get update -qq
  apt-get install -y -qq git
fi

if ! command -v docker >/dev/null 2>&1; then
  warn "Docker ist nicht installiert."
  if [ "$ASSUME_YES" != 1 ] && [ -t 0 ]; then
    read -r -p "Docker jetzt über get.docker.com installieren? [Y/n]: " answer
    case "${answer:-y}" in n|N) die "Docker wird benötigt." ;; esac
  fi
  log "Installiere Docker ..."
  curl -fsSL https://get.docker.com | sh
fi

docker compose version >/dev/null 2>&1 \
  || die "Docker Compose v2 fehlt. Installiere das Plugin 'docker-compose-plugin'."
systemctl enable --now docker >/dev/null 2>&1 || true

if ! docker info >/dev/null 2>&1; then
  log "Warte auf den Docker-Daemon ..."
  for _ in $(seq 1 30); do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
fi
docker info >/dev/null 2>&1 || die "Der Docker-Daemon läuft nicht. Starte ihn mit 'systemctl start docker'."

# --- Proxy-Modus ------------------------------------------------------------
port_busy() {
  local port="$1"
  { ss -ltnH 2>/dev/null || netstat -ltn 2>/dev/null; } \
    | awk '{print $4}' | grep -Eq "[:.]${port}$"
}

if [ "$MODE" = auto ] || [ -z "$MODE" ]; then
  if port_busy 80 || port_busy 443; then
    MODE=external
    warn "Port 80/443 ist belegt — nutze den bestehenden Webserver (external)."
  else
    MODE=bundled
  fi
fi
[ "$MODE" = bundled ] || [ "$MODE" = external ] || die "HUSTL_PROXY muss bundled oder external sein."

if [ "$MODE" = external ]; then
  HUSTL_PORT="${HUSTL_PORT:-3000}"
  PROXY_NETWORK="${PROXY_NETWORK:-hustl-proxy}"
  port_busy "$HUSTL_PORT" && die "Port $HUSTL_PORT ist belegt. Setze HUSTL_PORT auf einen freien Port."
  docker network inspect "$PROXY_NETWORK" >/dev/null 2>&1 \
    || docker network create "$PROXY_NETWORK" >/dev/null
fi

if ! getent ahosts "$HUSTL_DOMAIN" >/dev/null 2>&1; then
  warn "Die Domain $HUSTL_DOMAIN löst noch nicht auf. Caddy kann erst nach dem DNS-Eintrag ein Zertifikat holen."
  if [ "$ASSUME_YES" != 1 ] && [ -t 0 ]; then
    read -r -p "Trotzdem fortfahren? [y/N]: " answer
    [[ "${answer:-}" =~ ^[yY]$ ]] || exit 1
  fi
fi

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q 'Status: active'; then
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ok "ufw: 80/tcp und 443/tcp freigegeben (SSH bleibt unverändert)."
fi

# --- Verzeichnisse ----------------------------------------------------------
log "Lege $INSTALL_DIR an ..."
mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/backups" "$INSTALL_DIR/caddy/data" "$INSTALL_DIR/caddy/config"
chown -R 10001:10001 "$INSTALL_DIR/data"
chmod 700 "$INSTALL_DIR/data"

# --- Image bauen ------------------------------------------------------------
log "Baue das Hustl-Image (erster Build dauert ein paar Minuten) ..."
docker build -f "$REPO_ROOT/deploy/Dockerfile" -t hustl:latest "$REPO_ROOT"
ok "Image hustl:latest gebaut."

# --- Konfiguration ----------------------------------------------------------
HUSTL_VERSION="$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "$REPO_ROOT/package.json" | head -n 1)"
HUSTL_VERSION="${HUSTL_VERSION:-1.1.1}"

cat > "$ENV_FILE" <<EOF
HUSTL_DOMAIN=$HUSTL_DOMAIN
HUSTL_ORIGIN=https://$HUSTL_DOMAIN
HUSTL_RP_ID=$HUSTL_DOMAIN
ACME_EMAIL=$ACME_EMAIL
TZ=${TZ_VALUE:-Europe/Berlin}
HUSTL_PROXY=$MODE
HUSTL_PORT=${HUSTL_PORT:-3000}
PROXY_NETWORK=${PROXY_NETWORK:-hustl-proxy}
HUSTL_VERSION=$HUSTL_VERSION
EOF
chmod 600 "$ENV_FILE"

cp "$REPO_ROOT/deploy/selfhost/backup.sh" "$INSTALL_DIR/backup.sh"
cp "$REPO_ROOT/deploy/selfhost/restore.sh" "$INSTALL_DIR/restore.sh"
chmod 755 "$INSTALL_DIR/backup.sh" "$INSTALL_DIR/restore.sh"

if [ "$MODE" = bundled ]; then
  cp "$REPO_ROOT/deploy/selfhost/compose.bundled.yml" "$INSTALL_DIR/docker-compose.yml"
  cp "$REPO_ROOT/deploy/selfhost/Caddyfile.template" "$INSTALL_DIR/Caddyfile"
  ok "Caddy übernimmt TLS für https://$HUSTL_DOMAIN"
else
  cp "$REPO_ROOT/deploy/selfhost/compose.external.yml" "$INSTALL_DIR/docker-compose.yml"
  cat > "$INSTALL_DIR/Caddyfile.snippet" <<EOF
$HUSTL_DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:${HUSTL_PORT:-3000}
}
EOF
  cat > "$INSTALL_DIR/Caddyfile.docker.snippet" <<EOF
$HUSTL_DOMAIN {
	encode zstd gzip
	reverse_proxy hustl:3000
}
EOF
  warn "Hustl lauscht nur auf 127.0.0.1:${HUSTL_PORT:-3000}."
  warn "Host-Caddy/Nginx: $INSTALL_DIR/Caddyfile.snippet verwenden."
  warn "Docker-Caddy: $INSTALL_DIR/Caddyfile.docker.snippet verwenden und Caddy in das Netz $PROXY_NETWORK legen."
fi

# --- Start ------------------------------------------------------------------
log "Starte die Container ..."
cd "$INSTALL_DIR"
docker compose up -d --remove-orphans

log "Warte auf den Healthcheck ..."
for _ in $(seq 1 60); do
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' hustl 2>/dev/null || true)"
  [ "$status" = healthy ] && break
  sleep 2
done
[ "$status" = healthy ] || die "Container ist nicht healthy. Logs: docker logs hustl"
ok "Hustl läuft."

# --- Backup-Timer -----------------------------------------------------------
if command -v systemctl >/dev/null 2>&1; then
  cat > /etc/systemd/system/hustl-backup.service <<EOF
[Unit]
Description=Hustl SQLite-Snapshot und lokales Backup
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
Environment=HUSTL_DIR=$INSTALL_DIR
ExecStart=$INSTALL_DIR/backup.sh
EOF
  cat > /etc/systemd/system/hustl-backup.timer <<'EOF'
[Unit]
Description=Tägliches Hustl-Backup

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
RandomizedDelaySec=15m

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now hustl-backup.timer >/dev/null 2>&1 || true
  ok "Tägliches Backup um 03:30 aktiv (systemctl status hustl-backup.timer)."
fi

# --- Abschluss --------------------------------------------------------------
echo
if [ -f "$INSTALL_DIR/data/bootstrap-token.txt" ]; then
  token="$(head -n 1 "$INSTALL_DIR/data/bootstrap-token.txt")"
  echo "  Einrichtung:  https://$HUSTL_DOMAIN/setup?token=$token"
  echo
  echo "  Öffne den Link, lege deinen ersten Passkey an und bewahre die"
  echo "  Recovery-Codes auf. Danach ist der Token verbraucht."
else
  echo "  Login:        https://$HUSTL_DOMAIN"
fi
echo
echo "  Daten:        $INSTALL_DIR/data"
echo "  Konfiguration:$ENV_FILE"
echo "  Logs:         docker logs -f hustl"
echo "  Update:       cd $REPO_ROOT && git pull && sudo ./deploy/selfhost/install.sh"
echo "  Backup:       sudo $INSTALL_DIR/backup.sh"
echo
if [ "$MODE" = external ]; then
  echo "  Wichtig: Trage zuerst den passenden Caddyfile-Snippet in deinen"
  echo "  Webserver ein (Host: Caddyfile.snippet, Docker: Caddyfile.docker.snippet)."
  echo "  Docker-Netz: $PROXY_NETWORK"
  echo
fi
