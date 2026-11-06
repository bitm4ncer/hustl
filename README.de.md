<p align="center">
  <img src="resources/icon.png" alt="Hustl" width="96">
</p>

<h1 align="center">Hustl</h1>

<p align="center">
  <a href="README.md">English</a> · <strong>Deutsch</strong>
</p>

<p align="center">
  <strong>Rechnungen, Angebote und Finanzen für Soloselbstständige</strong> — self-hosted auf deinem eigenen VPS, als PWA auf jedem Gerät und als Desktop-App für Windows, macOS und Linux.
</p>

<p align="center">
  <a href="#auf-dem-eigenen-vps-installieren"><img alt="Self-hosted mit Docker" src="https://img.shields.io/badge/self--hosted-Docker-2496ED?logo=docker&logoColor=white"></a>
  <img alt="PWA, Windows, macOS und Linux" src="https://img.shields.io/badge/PWA%20%7C%20Windows%20%7C%20macOS%20%7C%20Linux-555">
  <img alt="Keine Cloud, kein Konto, keine Telemetrie" src="https://img.shields.io/badge/keine%20Cloud%20%C2%B7%20kein%20Konto%20%C2%B7%20keine%20Telemetrie-2ea44f">
  <a href="LICENSE"><img alt="Lizenz: ISC" src="https://img.shields.io/badge/lizenz-ISC-blue"></a>
</p>

---

Hustl ist eine Rechnungs- und Finanz-App für Soloselbstständige in Deutschland. Sie läuft auf deinem eigenen VPS: eine SQLite-Datenbank, ein Docker-Container, keine Cloud und kein Benutzerkonto bei einem Drittanbieter. Angemeldet wird per Passkey — ohne Passwort. Auf dem iPhone, am Desktop und im Browser lässt sie sich als PWA installieren; für Windows, macOS und Linux gibt es zusätzlich eine schlanke Desktop-App.

## Was Hustl kann

- **Rechnungen** schreiben, fortlaufend nummerieren, finalisieren und als PDF exportieren
- **E-Rechnung** nach EN 16931 (ZUGFeRD / Factur-X) als hybride PDF/A-3
- **Storno und Korrektur** mit eigener Nummer, plus Nummernkreis-Audit
- **Angebote** mit Versionen, Status und PDF; auf Wunsch direkt in Kunde und Projekt umwandeln
- **Kunden und Projekte** mit Positionen, Stunden und offenen Posten
- **Finanzen** mit Einnahmen, Ausgaben, Fixkosten, Dashboard, Prognose und Monatsexport
- **Belege** als PDF hochladen und Felder automatisch erkennen lassen
- **Kontoauszüge** importieren und Zahlungen den passenden Rechnungen zuordnen
- **To-dos** mit Kategorien für Shopping, Groceries, Tasks und Weeklys
- **Deutsch und Englisch** als Oberflächen- und Rechnungssprache, mit 12 Währungen
- **Vollarchiv** als ZIP mit Datenbank, allen PDFs und CSV-Dateien herunterladen

## Auf dem eigenen VPS installieren

### Voraussetzungen

| | |
|---|---|
| Server | 2 vCPU, mindestens 2 GB RAM (4 GB empfohlen), 10 GB freier Platz |
| System | Debian 12/13 oder Ubuntu 22.04/24.04, x86_64 oder arm64 |
| Domain | z. B. `hustl.example.com`, per A- und AAAA-Record auf den VPS |
| Ports | 22 (SSH), 80 und 443 offen |
| Zugang | SSH-Zugang mit Key oder Passwort |
| Werkzeuge | `git` für den Clone; `curl` installiert der Installer bei Bedarf nach |

### Ein Befehl

```bash
# Repository auf den VPS holen (Zugang zum Repository vorausgesetzt)
sudo mkdir -p /opt/hustl
sudo chown "$USER":"$USER" /opt/hustl
git clone https://github.com/bitm4ncer/hustl.git /opt/hustl/src
cd /opt/hustl/src

# Installieren – fragt Domain und E-Mail ab
sudo ./deploy/selfhost/install.sh
```

Nicht-interaktiv, z. B. für einen Agenten oder ein Skript:

```bash
sudo HUSTL_DOMAIN=hustl.example.com \
     ACME_EMAIL=du@example.com \
     HUSTL_ASSUME_YES=1 \
     ./deploy/selfhost/install.sh
```

Der Installer erledigt alles Nötige:

1. prüft System, Docker und die Ports 80/443
2. baut das Hustl-Image und legt `/opt/hustl` an
3. startet Hustl und – im `bundled`-Modus – Caddy mit automatischem HTTPS
4. wartet auf den Healthcheck und richtet ein tägliches Backup um 03:30 ein
5. gibt den einmaligen Setup-Link für den ersten Passkey aus

Danach öffnest du den Link `https://<deine-domain>/setup?token=…`, legst deinen **ersten Passkey** an und bewahrst die **zehn Recovery-Codes** auf. Der Token ist danach verbraucht. Ein weiteres Gerät lässt sich später über einen Recovery-Code hinzufügen.

> **Schon ein Webserver auf Port 80/443?** Der Installer erkennt das und schaltet automatisch in den `external`-Modus. Hustl lauscht dann nur auf `127.0.0.1:3000`; den fertigen Block findest du unter `/opt/hustl/Caddyfile.snippet`. Erzwingen lässt sich der Modus mit `HUSTL_PROXY=external`. Läuft dein Caddy selbst als Container, starte mit `HUSTL_PROXY=external PROXY_NETWORK=web` und nutze `/opt/hustl/Caddyfile.docker.snippet` (Proxy auf `hustl:3000`).

### Mit einem Agenten installieren

Wenn du die Installation nicht selbst tippen willst: [`INSTALL-WITH-AGENT.md`](INSTALL-WITH-AGENT.md) enthält einen kopierfertigen Prompt mit Fragenkatalog (VPS vorhanden? SSH? Domain? Docker? Firewall?) und Runbook. Der Agent prüft den Ist-Zustand, fragt vor destruktiven Schritten nach und verifiziert jeden Schritt.

## Lokal installieren

Hustl braucht immer eine erreichbare Server-Instanz. Für den täglichen Gebrauch gibt es zwei Wege:

### PWA (empfohlen, alle Plattformen)

1. `https://<deine-domain>` im Browser öffnen und per Passkey anmelden.
2. Im Browser „App installieren“ wählen (Chrome/Edge) oder unter iOS „Zum Home-Bildschirm“.
3. Die App startet ohne Browser-Leiste, mit Face ID bzw. Windows Hello.

Das funktioniert auf Windows, macOS, Linux, iPhone, iPad und Android — ohne Build und ohne Installer.

### Native Desktop-App

Die Desktop-App ist eine schlanke Electron-Shell um dieselbe Web-Oberfläche. Beim ersten Start fragt sie nach deiner Server-URL und speichert sie lokal.

| Plattform | Datei | Hinweis |
|---|---|---|
| Windows | `Hustl-Setup-<version>.exe` | NSIS-Installer, keine Admin-Rechte nötig |
| macOS | `Hustl-<version>-arm64.dmg` oder `-x64.dmg` | Apple Silicon bzw. Intel |
| Linux | `Hustl-<version>.AppImage` | `chmod +x` und starten |

Downloads: [github.com/bitm4ncer/hustl/releases/latest](https://github.com/bitm4ncer/hustl/releases/latest)

Die Builds sind **unsigniert**. Beim ersten Start musst du sie deshalb einmal freigeben:

- **Windows:** „Weitere Informationen“ → „Trotzdem ausführen“.
- **macOS:** Rechtsklick auf die App → „Öffnen“ → „Öffnen“, oder
  `xattr -dr com.apple.quarantine /Applications/Hustl.app`.
- **Linux:** `chmod +x Hustl-*.AppImage && ./Hustl-*.AppImage`.

Server-URL später ändern: Menü **Hustl → Server-URL ändern…** oder `Strg+Shift+S` (`⌘⇧S` auf macOS).

## Nach der Installation

| Aufgabe | Wo |
|---|---|
| Anmelden | `https://<deine-domain>` |
| Erststart / Passkey | `https://<deine-domain>/setup?token=…` (steht im Installer-Output) |
| Weiteres Gerät hinzufügen | Login → „Passkey verloren?“ → Recovery-Code |
| Vollarchiv herunterladen | Einstellungen → Daten → „Archiv herunterladen“ |
| Logs | `docker logs -f hustl` |
| Caddy-Logs | `docker logs -f hustl-caddy` |
| Daten | `/opt/hustl/data` |
| Konfiguration | `/opt/hustl/.env` |

## Betrieb

### Update

```bash
cd /opt/hustl/src
git pull
sudo ./deploy/selfhost/install.sh
```

Der Installer baut das Image neu, startet die Container neu und lässt Daten sowie `.env` unangetastet.

### Backup

Der Installer richtet einen systemd-Timer ein, der täglich um 03:30 einen konsistenten SQLite-Snapshot erzeugt:

```bash
sudo /opt/hustl/backup.sh
systemctl status hustl-backup.timer
```

Die Snapshots liegen unter `/opt/hustl/data/backups` (sieben Stück, von der App rotiert) und als Kopie unter `/opt/hustl/backups` (14 Tage). Für ein Offsite-Backup kann `backup.sh` restic verwenden:

```bash
sudo RESTIC_REPOSITORY=sftp:hustl-backup:/ \
     RESTIC_PASSWORD_FILE=/etc/hustl/restic.pass \
     /opt/hustl/backup.sh
```

### Restore

```bash
# Nur prüfen, nichts verändern
sudo /opt/hustl/restore.sh --check /opt/hustl/backups/hustl-2026-11-04.db

# Wirklich zurückspielen (Container wird gestoppt)
sudo /opt/hustl/restore.sh /opt/hustl/backups/hustl-2026-11-04.db
```

Die aktuelle Datenbank wird vorher als `hustl.db.before-<zeitstempel>` gesichert. Ein Restore ohne geprüftes Backup ist keine gute Idee.

### Domain wechseln

Passkeys sind an die Domain gebunden. Ein Wechsel von `HUSTL_DOMAIN` macht alle bisherigen Passkeys ungültig. Danach ist ein Reset nötig:

```bash
docker exec hustl node dist/server/cli.mjs reset-auth
```

Der neue Bootstrap-Token steht in `/opt/hustl/data/bootstrap-token.txt`.

### Passkey verloren?

Wenn noch ein weiterer Passkey existiert: einfach damit anmelden. Wenn nicht, bleibt nur der Reset über die Shell (siehe oben). Deshalb: **Recovery-Codes getrennt vom Gerät aufbewahren** und bei Bedarf ein zweites Gerät über einen Code hinzufügen.

## Technik

- **Stack:** Electron 42, TypeScript, React 19, Vite 7, Tailwind 3
- **Server:** Fastify 5, `node:sqlite` (keine nativen Abhängigkeiten), Chromium für PDF, `node-zugferd` für E-Rechnungen
- **Betrieb:** Docker, non-root-Container, read-only Rootfs, 1-GB-Speicherlimit, kein nach außen veröffentlichter Port im `bundled`-Modus
- **Sicherheit:** WebAuthn-Passkeys, HttpOnly-Session-Cookies, CSRF-Schutz und Rate-Limits; TLS über den Reverse Proxy (Caddy im `bundled`-Modus)
- **Daten:** `/data/hustl.db`, PDFs unter `/data/invoices`, `/data/offers`, `/data/expenses`, `/data/statements`, Vorlagen unter `/data/template`
- **Backup:** SQLite-Snapshot plus Dateien; optional restic mit clientseitiger Verschlüsselung

```
src/
├─ core/        DB, Export, Import, Bank, Belege (ohne Electron)
├─ server/      Fastify, Auth, RPC, Dateien, Archiv
├─ renderer/    React-UI und PWA
├─ main/        Electron-Shell und Erststart-Dialog
└─ shared/      Typen und reine Logik
deploy/
├─ Dockerfile
└─ selfhost/    Installer, Compose, Caddy, Backup, Restore
```

## Entwicklung

Vorausgesetzt ist Node 24 oder neuer.

```bash
npm install

npm run dev          # Electron mit lokalem IPC (Entwicklung)
npm run build:web    # PWA nach dist/web bauen
npm run dev:server   # Fastify auf :3000 (nach build:web)
npm run icons        # PWA-Icons und build/icon.icns neu erzeugen
npm test             # Unit-Tests mit Vitest
npm run test:e2e     # Playwright gegen die laufende Instanz
```

Installer bauen (jeweils auf dem Zielsystem bzw. in CI):

```bash
npm run dist:win     # Windows NSIS
npm run dist:mac     # macOS DMG (x64 + arm64)
npm run dist:linux   # Linux AppImage
```

Der Release-Workflow `.github/workflows/release.yml` baut alle drei Pakete bei einem Tag `v*` und hängt sie an das GitHub-Release.

## Grenzen

- **Ein Benutzer.** Hustl ist bewusst keine Multi-Tenant-Plattform.
- **Kein Offline-Schreibbetrieb.** Der Server ist die einzige Datenquelle; ohne Verbindung lässt sich die App nicht sinnvoll bedienen.
- **Nicht in der Web-/PWA-Version enthalten:** E-Mail-Versand per SMTP, GoCardless-Banksync, Notion-Import und der Vorlagen-Editor auf dem Smartphone. Der verpackte Desktop-Client lädt dieselbe Web-Oberfläche; diese Funktionen gibt es nur im lokalen Electron-Entwicklungsbetrieb.
- **Unsigned Builds.** Windows SmartScreen und macOS Gatekeeper brauchen beim ersten Start eine manuelle Freigabe.
- **E-Rechnung:** Die erzeugten Dateien folgen EN 16931. Vor dem ersten echten Versand sollte eine Beispielrechnung einmal mit dem offiziellen KoSIT-Validator geprüft werden; die Bibliothek prüft die XML-Struktur, nicht alle Geschäftsregeln.
- **Backup ist Pflicht.** Ohne funktionierendes Backup gibt es keinen zweiten Datenstand.

## Datenschutz

Deine Rechnungen, Kunden und Belege liegen auf deinem VPS — nicht bei Hustl. Es gibt keine Analytics, keine Telemetrie und kein Benutzerkonto bei einem Drittanbieter. Die Anmeldung erfolgt per Passkey; es wird kein Passwort gespeichert. Backups verlassen den Server nur, wenn du restic oder ein anderes Offsite-Ziel einrichtest — dann clientseitig verschlüsselt.

## Lizenz

[ISC](LICENSE). Hustl ist ein persönliches Projekt, das aktiv weiterwächst.
