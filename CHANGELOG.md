# Changelog

## 1.0.0 – 2026-11-06

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
- **Tägliches Backup** per systemd-Timer, optional restic für Offsite

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
- Backup: täglich um 03:30 nach `/opt/hustl/backups`
- Update: `cd /opt/hustl/src && git pull && sudo ./deploy/selfhost/install.sh`

### Bekannte Grenzen

- Ein Benutzer pro Instanz
- Kein Offline-Schreibbetrieb
- E-Mail-Versand, GoCardless-Banksync und Notion-Import sind nicht in der Web-Version
- Installer sind unsigniert (Windows SmartScreen / macOS Gatekeeper)
