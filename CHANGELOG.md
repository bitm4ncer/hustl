# Changelog

## 1.1.3 (2026-11-09)

### Korrigiert

- Standalone und Client nutzen getrennte Updater-Caches. Ohne das konnten sich
  die Update-Pakete der beiden Varianten gegenseitig überschreiben.

## 1.1.2 (2026-11-09)

Hustl Standalone als eigener Download, automatische Updates und Archiv-Restore.

### Neu

- **Hustl Standalone**: läuft lokal ohne Server, Docker oder Konto. Die App
  startet denselben Hustl-Server im Electron-Prozess und lauscht nur auf
  `127.0.0.1`.
- **Zwei getrennte Desktop-Downloads**: Standalone und Client mit eigenen
  `appId`s, Datenordnern und Update-Kanälen. Beide lassen sich nebeneinander
  installieren.
- **Automatische Updates** für Windows und Linux; der Client nutzt `latest`,
  die Standalone-App `standalone`. macOS bleibt bis zur Signierung manuell.
- **Vollarchiv wiederherstellen** in den Einstellungen, mit Manifest-Prüfung,
  SHA-256, Zip-Slip-Schutz und automatischem Sicherheitsbackup.
- **Stabile Download-Namen** für Landingpage und README.

### Geändert

- Das Vollarchiv nimmt die laufende `hustl.db` nicht mehr doppelt auf.

## 1.1.1 (2026-11-07)

Fachtcheck-Korrekturen, zweisprachige Website und genauere Betriebsangaben.

### Neu

- **Zweisprachige Landingpage**: Englisch als Default auf `/`, Deutsch unter
  `/de/`, mit DE/EN-Umschalter, hreflang, Canonical und Sitemap-Einträgen
- **Hosting-Abschnitt**: VPS, eigener Server/NAS, Raspberry Pi/Heimserver,
  PaaS/Kubernetes mit persistentem Volume
- **FAQ zu Single-User-Betrieb**

### Korrigiert

- Domainpreise realistisch: ca. 5 bis 30 €/Jahr je nach TLD und Anbieter statt
  pauschal 1 €/Monat
- VPS-Empfehlung: 2 GB Minimum, 4 GB empfohlen, 20 GB Speicher empfohlen;
  erster Build 15 bis 30 Minuten
- Installer installiert `git` nach; Git steht in den Voraussetzungen
- NAS/PaaS-Hinweise: Installer nur für Debian/Ubuntu; SQLite braucht eine
  Replica und ein blockbasiertes Volume
- Backup klargestellt: der tägliche Snapshot enthält die Datenbank; PDFs und
  Belege kommen über restic oder das Vollarchiv dazu
- `.env` wird bei Updates neu geschrieben, Daten bleiben erhalten
- SMTP, GoCardless und Notion-Import sind nicht enthalten; der Vorlagen-Editor
  ist in der Web-Oberfläche verfügbar
- E-Rechnung: Datenmodell-Prüfung, keine vollständige XSD/Schematron-Validierung
- HTTPS-Hinweis für den `external`-Modus; Caddy-Logs nur im gebündelten Modus
- Kontrast und mobile Navigation verbessert

## 1.1.0 (2026-11-07)

Neue öffentliche Website, verständlichere Dokumentation und stabile Download-Links.

### Neu

- **Landingpage** unter [bitm4ncer.github.io/hustl](https://bitm4ncer.github.io/hustl/):
  Funktionen, Screenshots mit fiktiven Demo-Daten, Installation, Downloads und FAQ
- **Stabile Download-Namen** für alle Releases:
  `Hustl-win.exe`, `Hustl-mac-arm64.dmg`, `Hustl-mac-x64.dmg`, `Hustl-linux.AppImage`
- **README auf Deutsch und Englisch** komplett überarbeitet: für nicht-technische
  Leser verständlich, mit Screenshots, Kosten, FAQ und den technischen Details am Ende
- **GitHub Pages** wird automatisch aus `site/` veröffentlicht

### Verbessert

- Desktop-Downloads sind jetzt direkt und versionsunabhängig verlinkbar
- Klarere Erklärung, was Hustl kostet, was du für den Betrieb brauchst und wo die
  Grenzen liegen
- README verlinkt Website, Screenshots und den Agenten-Leitfaden

### Bekannte Grenzen

- Ein Benutzer pro Instanz
- Kein Offline-Schreibbetrieb
- E-Mail-Versand, GoCardless-Banksync und Notion-Import sind nicht enthalten
- Installer sind unsigniert (Windows SmartScreen / macOS Gatekeeper)

## 1.0.0 (2026-11-06)

Erste öffentliche Version. Hustl ist jetzt self-hosted: eine Web-App/PWA auf
dem eigenen VPS, dazu eine schlanke Desktop-Shell für Windows, macOS und Linux.

### Neu

- **Self-hosted Web-App** mit Fastify, SQLite und Passkey-Login
- **PWA** für iPhone, iPad, Android, Windows, macOS und Linux
- **Docker-Installer** mit eigenem Caddy oder vorhandenem Reverse Proxy
- **Desktop-Shell** für Windows, macOS und Linux; Server-URL beim ersten Start
- **Deutsch und Englisch** als Oberflächen- und Rechnungssprache
- **12 Währungen** für Rechnungen und Angebote
- **To-dos** mit Kategorien und Reset-Regeln
- **Vollarchiv** mit Datenbank, PDFs und CSV-Tabellen
- **Täglicher Datenbank-Snapshot** per systemd-Timer, optional restic für Offsite

### Bestehende Funktionen

- Rechnungen, E-Rechnung nach EN 16931 (ZUGFeRD / Factur-X), Storno und Korrektur
- Angebote mit Versionen und Umwandlung in Kunde/Projekt
- Kunden, Projekte, Positionen und Zeiterfassung
- Finanzen, Ausgaben, Fixkosten, Prognose und Monatsexport
- Beleg-Upload mit Feldextraktion und Kontoauszug-Abgleich
- Rechnungsvorlage mit Logo, Akzentfarbe, Schriften und Live-Vorschau

### Betrieb

- Installer: `sudo ./deploy/selfhost/install.sh`
- Agenten-Installation: `INSTALL-WITH-AGENT.md`
- Backup: täglicher Datenbank-Snapshot um 03:30 nach `/opt/hustl/backups`
- Update: `cd /opt/hustl/src && git pull && sudo ./deploy/selfhost/install.sh`

### Bekannte Grenzen

- Ein Benutzer pro Instanz
- Kein Offline-Schreibbetrieb
- E-Mail-Versand, GoCardless-Banksync und Notion-Import sind nicht enthalten
- Installer sind unsigniert (Windows SmartScreen / macOS Gatekeeper)
