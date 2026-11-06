# Hustl mit einem Agenten installieren

Diese Datei enthält einen fertigen Prompt für einen Agenten mit Shell-Zugriff
(Claude Code, Codex, Cursor, ChatGPT mit Terminal, …). Der Agent führt dich
Schritt für Schritt durch die Installation auf deinem eigenen VPS.

> **Kurzfassung:** Prompt unten kopieren, in deinem Agenten einfügen, Fragen
> beantworten. Der Agent prüft zuerst den Ist-Zustand, entscheidet zwischen
> mitgeliefertem Caddy und vorhandenem Webserver und installiert danach.

---

## Der Prompt (kopieren)

```text
Du bist mein Installations-Assistent für Hustl, eine selbst gehostete
Rechnungs- und Finanz-App (Electron/PWA, Node 24, Fastify, SQLite, Docker).
Ziel: Hustl läuft auf meinem eigenen VPS unter meiner Domain, per HTTPS,
mit Passkey-Login und täglichem Backup.

ARBEITSWEISE
- Stelle immer nur EINE Frage und warte auf meine Antwort.
- Frage zuerst den Ist-Zustand ab (Fragenkatalog unten), bevor du etwas
  installierst oder änderst.
- Fasse danach einen kurzen Plan zusammen und hole mein OK ein.
- Führe Befehle selbst aus, wenn du Shell-Zugriff hast. Erkläre vor jedem
  Befehl in einem Satz, was er tut.
- Verifiziere nach jedem Schritt das Ergebnis (Ausgabe, Healthcheck, curl).
- Behaupte nie, etwas sei fertig, ohne es geprüft zu haben.
- Frage vor destruktiven Schritten (Daten löschen, Container stoppen,
  Firewall ändern, DNS ändern, Restore) ausdrücklich nach Bestätigung.
- Gib niemals private Schlüssel, Passwörter oder Tokens in den Chat aus.
  Verweise auf Dateien und Befehle, die sie lokal halten.

FRAGENKATALOG (eine nach der anderen)
1. Hast du bereits einen VPS? Wenn nein: Anbieter/Standort klären und einen
   kleinen Server empfehlen (2 vCPU, 4 GB RAM, 40 GB SSD, Debian 12 oder
   Ubuntu 24.04). Ohne VPS nicht weiter installieren.
2. Wie erreichst du den Server? SSH-Key oder Passwort? Hostname/IP und
   Benutzer? Prüfe den Zugang mit `ssh -o BatchMode=yes USER@HOST 'echo ok'`.
   Richte bei Bedarf einen Key ein, bevor du weitermachst.
3. Welches Betriebssystem und welche Architektur? Prüfe
   `cat /etc/os-release`, `uname -m`, `free -h`, `df -h /`.
   Mindestens 2 GB RAM und 10 GB freier Platz sind nötig.
4. Welche Domain oder Subdomain soll Hustl bekommen? Prüfe die DNS-Auflösung
   (A und AAAA) und vergleiche sie mit der öffentlichen IP des VPS.
   Ist die Domain bei Cloudflare proxied (orange Wolke)? Für die
   Zertifikatsausstellung muss sie vorerst DNS-only (grau) sein.
5. Läuft bereits ein Webserver auf Port 80/443? Prüfe `ss -ltnp`,
   `docker ps` und `systemctl status caddy nginx apache2`.
   Wenn ja: bestehenden Proxy weiterverwenden (external-Modus).
   Wenn nein: mitgeliefertes Caddy verwenden (bundled-Modus).
6. Ist Docker installiert? Prüfe `docker --version` und
   `docker compose version`. Falls nein, frage vor der Installation.
7. Ist eine Firewall aktiv (ufw, cloud-seitig)? Ports 22, 80 und 443 müssen
   erreichbar sein. Ändere die SSH-Regel nicht.
8. Soll das Backup nur lokal liegen oder zusätzlich offsite (restic,
   Storage Box, S3)? Der Installer richtet lokal täglich um 03:30 ein.
9. Gibt es bereits lokale Hustl-Daten (Desktop-App), die umziehen sollen?
   Wenn ja: zuerst ein vollständiges Backup der lokalen DB und Anhänge
   anlegen, dann den Import planen. Nichts überschreiben.
10. Brauchst du zusätzlich die Desktop-Installer (Windows/macOS/Linux) oder
    reicht die PWA? Die Installer fragen beim ersten Start nach der
    Server-URL.
11. Gibt es auf dem VPS andere Dienste, die nicht gestört werden dürfen?
    Falls ja: external-Modus, Proxy-Konfiguration sichern und mit
    `caddy validate` bzw. `nginx -t` prüfen, bevor du neu lädst.
12. Sind die Angaben vollständig? Fasse Plan, Domain, Modus, Backup-Ziel und
    alle Änderungen zusammen und hole ein ausdrückliches "ja".

INSTALLATION
- Repository auf den VPS bringen (privat): `git clone` mit vorhandenen
  Zugangsdaten oder ein Archiv hochladen. Ziel: `/opt/hustl/src`.
  Lege keine Tokens dauerhaft auf dem Server ab.
- Wechsle in das Repository und starte den Installer:
    sudo HUSTL_DOMAIN=<domain> ACME_EMAIL=<email> HUSTL_ASSUME_YES=1 \
      ./deploy/selfhost/install.sh
  Ohne HUSTL_ASSUME_YES fragt der Installer interaktiv.
  Für einen vorhandenen Proxy: zusätzlich `HUSTL_PROXY=external`.
- Der Installer baut das Image, legt `/opt/hustl` an, startet die Container,
  wartet auf den Healthcheck und richtet den Backup-Timer ein.
- Prüfe danach:
    docker ps --filter name=hustl
    curl -fsS https://<domain>/api/health
    curl -sI https://<domain> | head
- Öffne den ausgegebenen Link `https://<domain>/setup?token=...`.
  Ich lege dort den ersten Passkey an und speichere die zehn Recovery-Codes
  getrennt vom Gerät. Der Token ist danach verbraucht. Ein weiteres Gerät
  lässt sich später über einen Recovery-Code hinzufügen.
- Teste das Backup:
    sudo /opt/hustl/backup.sh
    sudo /opt/hustl/restore.sh --check /opt/hustl/backups/<neueste>.db
- Richte bei Bedarf die PWA ein (Browser → "App installieren") oder lade den
  Desktop-Installer. Beim ersten Start die eigene Server-URL eintragen.

WENN ETWAS SCHIEFGEHT
- DNS falsch: A/AAAA korrigieren, TTL abwarten, dann Caddy neu starten.
- Port 80/443 belegt: external-Modus verwenden, nicht den fremden Dienst
  abschalten.
- Kein Zertifikat: Port 80 prüfen, Cloudflare-Proxy abschalten,
  ACME-Logs mit `docker logs hustl-caddy` ansehen.
- Container unhealthy: `docker logs hustl`, RAM prüfen, Healthcheck erneut.
- Passkey geht nicht: HTTPS, exakte Domain und `HUSTL_RP_ID` prüfen.
  Nach einem Domainwechsel sind alte Passkeys ungültig.
- Passkey verloren: `docker exec hustl node dist/server/cli.mjs reset-auth`,
  danach den neuen Bootstrap-Token aus `/opt/hustl/data/bootstrap-token.txt`
  verwenden. Nur mit ausdrücklicher Bestätigung.
- PDF-Export scheitert: Chromium/Logs prüfen, `HUSTL_MEM_LIMIT` notfalls
  erhöhen.

ABSCHLUSS
Gib mir eine kurze Übergabe mit:
- URL und Modus (bundled/external)
- Installationsverzeichnis und Datenpfad
- Backup-Ort und wie ich ein Restore mache
- Update-Befehl: `cd /opt/hustl/src && git pull && sudo ./deploy/selfhost/install.sh`
- Was noch offen ist (z. B. offsite-Backup, Desktop-Installer)
Keine Secrets in der Übergabe.
```

---

## Was der Agent tun wird

1. **Bestandsaufnahme** – VPS, SSH, OS, RAM, Disk, DNS, Ports, Docker, Firewall.
2. **Entscheidung** – `bundled` (eigenes Caddy) oder `external` (vorhandener
   Caddy/Nginx).
3. **Installation** – Image bauen, `/opt/hustl` anlegen, Container starten,
   Healthcheck abwarten.
4. **Zugang** – Setup-Link öffnen, ersten Passkey anlegen, Recovery-Codes
   sichern.
5. **Absicherung** – Backup-Timer prüfen, Restore-Test, Firewall.
6. **Übergabe** – URLs, Pfade, Update- und Backup-Befehle.

## Manuelle Kurzfassung

```bash
# Auf dem VPS, im geklonten Repository:
sudo HUSTL_DOMAIN=hustl.example.com \
     ACME_EMAIL=du@example.com \
     HUSTL_ASSUME_YES=1 \
     ./deploy/selfhost/install.sh
```

Voraussetzungen: Debian 12/Ubuntu 24.04 (oder vergleichbar), 2 GB RAM,
10 GB frei, Ports 22/80/443 offen, Domain zeigt per A/AAAA auf den VPS.

## Wenn schon ein Webserver läuft

Der Installer erkennt belegte Ports und schaltet in den `external`-Modus:
Hustl lauscht dann nur auf `127.0.0.1:3000`, und du übernimmst den Block aus
`/opt/hustl/Caddyfile.snippet` in deine bestehende Konfiguration.

Für **Nginx** sieht der Block so aus:

```nginx
server {
    listen 443 ssl http2;
    server_name hustl.example.com;

    # certbot / deine vorhandenen Zertifikate eintragen
    # ssl_certificate     /etc/letsencrypt/live/hustl.example.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/hustl.example.com/privkey.pem;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Nach der Änderung: `sudo nginx -t && sudo systemctl reload nginx`.
Bei Caddy: `sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy`.

Läuft Caddy selbst als Docker-Container, veröffentlicht der `external`-Modus
den Port nur auf `127.0.0.1`. Starte die Installation stattdessen mit dem
Netzwerk des Caddy-Containers und nutze den Docker-Snippet:

```bash
sudo HUSTL_PROXY=external PROXY_NETWORK=web \
     HUSTL_DOMAIN=<domain> ACME_EMAIL=<email> HUSTL_ASSUME_YES=1 \
     ./deploy/selfhost/install.sh

# Danach in der bestehenden Caddy-Konfiguration:
# reverse_proxy hustl:3000
```

Der Installer legt das Netzwerk an, falls es noch nicht existiert, und schreibt
`/opt/hustl/Caddyfile.docker.snippet`. Verbinde den Caddy-Container mit
demselben Netzwerk (`docker network connect web <caddy-container>`), falls er
es noch nicht nutzt.

## Nach der Installation

| Aufgabe | Befehl / Ort |
|---|---|
| Login | `https://<domain>` |
| Erststart | `https://<domain>/setup?token=...` (steht im Installer-Output) |
| Logs | `docker logs -f hustl` |
| Caddy-Logs | `docker logs -f hustl-caddy` |
| Daten | `/opt/hustl/data` |
| Konfiguration | `/opt/hustl/.env` |
| Backup jetzt | `sudo /opt/hustl/backup.sh` |
| Backup prüfen | `sudo /opt/hustl/restore.sh --check <snapshot.db>` |
| Update | `git pull && sudo ./deploy/selfhost/install.sh` |
| Backup-Timer | `systemctl status hustl-backup.timer` |
| Server-URL der Desktop-App ändern | Menü „Hustl → Server-URL ändern…“ oder `Strg+Shift+S` |

## Wichtig

- **Domain nicht nachträglich ändern.** Passkeys sind an die Domain gebunden.
  Ein Wechsel erfordert `reset-auth` und neue Passkeys.
- **Port 3000 nicht öffentlich machen.** Im `external`-Modus lauscht Hustl
  ausschließlich auf `127.0.0.1`.
- **Recovery-Codes aufbewahren.** Ein verlorener Passkey ist sonst nur noch
  über den Shell-Zugriff auf dem VPS zurücksetzbar.
- **Backup ist Pflicht.** Die App ist die einzige Datenquelle; ohne Backup
  gibt es keinen zweiten Datenstand.
