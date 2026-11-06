<p align="center">
  <img src="resources/icon.png" alt="Hustl" width="96">
</p>

<h1 align="center">Hustl</h1>

<p align="center">
  <strong>English</strong> · <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  <strong>Invoices, offers and finances for freelancers</strong> — self-hosted on your own VPS, as a PWA on any device and as a desktop app for Windows, macOS and Linux.
</p>

<p align="center">
  <a href="#install-on-your-own-vps"><img alt="Self-hosted with Docker" src="https://img.shields.io/badge/self--hosted-Docker-2496ED?logo=docker&logoColor=white"></a>
  <img alt="PWA, Windows, macOS and Linux" src="https://img.shields.io/badge/PWA%20%7C%20Windows%20%7C%20macOS%20%7C%20Linux-555">
  <img alt="No cloud, no account, no telemetry" src="https://img.shields.io/badge/no%20cloud%20%C2%B7%20no%20account%20%C2%B7%20no%20telemetry-2ea44f">
  <a href="LICENSE"><img alt="License: ISC" src="https://img.shields.io/badge/license-ISC-blue"></a>
</p>

---

Hustl is an invoicing and finance app for freelancers in Germany. It runs on your own VPS: one SQLite database, one Docker container, no cloud and no third-party account. You sign in with a passkey — no password. Install it as a PWA on iPhone, desktop or in the browser; there is also a slim desktop app for Windows, macOS and Linux.

## What Hustl can do

- **Invoices**: create, number sequentially, finalize and export as PDF
- **E-invoicing** according to EN 16931 (ZUGFeRD / Factur-X) as a hybrid PDF/A-3
- **Cancellations and corrections** with their own number, plus number-sequence audit
- **Offers** with versions, status and PDF; convert them directly into a client and project
- **Clients and projects** with line items, hours and outstanding items
- **Finance** with income, expenses, fixed costs, dashboard, forecast and monthly export
- **Receipts**: upload PDFs and extract fields automatically
- **Bank statements**: import them and match payments to the right invoices
- **To-dos** with categories for shopping, groceries, tasks and weeklies
- **German and English** UI and invoice language, with 12 currencies
- **Full archive** as a ZIP with the database, all PDFs and CSV files

## Install on your own VPS

### Requirements

| | |
|---|---|
| Server | 2 vCPU, at least 2 GB RAM (4 GB recommended), 10 GB free disk |
| OS | Debian 12/13 or Ubuntu 22.04/24.04, x86_64 or arm64 |
| Domain | e.g. `hustl.example.com`, with A and AAAA records pointing to the VPS |
| Ports | 22 (SSH), 80 and 443 open |
| Access | SSH access with a key or password |
| Tools | `git` for the clone; the installer installs `curl` if needed |

### One command

```bash
# Fetch the repository onto the VPS (repository access required)
sudo mkdir -p /opt/hustl
sudo chown "$USER":"$USER" /opt/hustl
git clone https://github.com/bitm4ncer/hustl.git /opt/hustl/src
cd /opt/hustl/src

# Install — prompts for domain and email
sudo ./deploy/selfhost/install.sh
```

Non-interactive, e.g. for an agent or a script:

```bash
sudo HUSTL_DOMAIN=hustl.example.com \
     ACME_EMAIL=you@example.com \
     HUSTL_ASSUME_YES=1 \
     ./deploy/selfhost/install.sh
```

The installer does everything that is needed:

1. checks the system, Docker and ports 80/443
2. builds the Hustl image and creates `/opt/hustl`
3. starts Hustl and — in `bundled` mode — Caddy with automatic HTTPS
4. waits for the health check and sets up a daily backup at 03:30
5. prints the one-time setup link for the first passkey

Then open `https://<your-domain>/setup?token=…`, create your **first passkey** and store the **ten recovery codes**. The token is consumed afterwards. You can add another device later with a recovery code.

> **Already running a web server on ports 80/443?** The installer detects this and switches to `external` mode. Hustl then only listens on `127.0.0.1:3000`; the ready-made block is at `/opt/hustl/Caddyfile.snippet`. Force the mode with `HUSTL_PROXY=external`. If Caddy itself runs in a container, start with `HUSTL_PROXY=external PROXY_NETWORK=web` and use `/opt/hustl/Caddyfile.docker.snippet` (proxy to `hustl:3000`).

### Install with an agent

If you don't want to type the installation yourself: [`INSTALL-WITH-AGENT.md`](INSTALL-WITH-AGENT.md) contains a copy-paste prompt with a question catalogue (VPS ready? SSH? domain? Docker? firewall?) and a runbook. The agent checks the current state, asks before destructive steps and verifies every step. The guide is currently in German.

## Install locally

Hustl always needs a reachable server instance. There are two ways to use it day to day:

### PWA (recommended, all platforms)

1. Open `https://<your-domain>` in a browser and sign in with your passkey.
2. Choose "Install app" in the browser (Chrome/Edge) or "Add to Home Screen" on iOS.
3. The app starts without browser chrome, with Face ID or Windows Hello.

Works on Windows, macOS, Linux, iPhone, iPad and Android — no build and no installer.

### Native desktop app

The desktop app is a slim Electron shell around the same web UI. On first launch it asks for your server URL and stores it locally.

| Platform | File | Note |
|---|---|---|
| Windows | `Hustl-Setup-<version>.exe` | NSIS installer, no admin rights required |
| macOS | `Hustl-<version>-arm64.dmg` or `-x64.dmg` | Apple Silicon or Intel |
| Linux | `Hustl-<version>.AppImage` | `chmod +x` and run |

Downloads: [github.com/bitm4ncer/hustl/releases/latest](https://github.com/bitm4ncer/hustl/releases/latest)

The builds are **unsigned**, so you need to allow them once:

- **Windows:** "More info" → "Run anyway".
- **macOS:** right-click the app → "Open" → "Open", or
  `xattr -dr com.apple.quarantine /Applications/Hustl.app`.
- **Linux:** `chmod +x Hustl-*.AppImage && ./Hustl-*.AppImage`.

Change the server URL later: menu **Hustl → Change server URL…** or `Ctrl+Shift+S` (`⌘⇧S` on macOS).

## After installation

| Task | Where |
|---|---|
| Sign in | `https://<your-domain>` |
| First start / passkey | `https://<your-domain>/setup?token=…` (printed by the installer) |
| Add another device | Login → "Lost your passkey?" → recovery code |
| Download full archive | Settings → Data → "Download archive" |
| Logs | `docker logs -f hustl` |
| Caddy logs | `docker logs -f hustl-caddy` |
| Data | `/opt/hustl/data` |
| Configuration | `/opt/hustl/.env` |

## Operations

### Update

```bash
cd /opt/hustl/src
git pull
sudo ./deploy/selfhost/install.sh
```

The installer rebuilds the image, restarts the containers and leaves data and `.env` untouched.

### Backup

The installer sets up a systemd timer that creates a consistent SQLite snapshot every day at 03:30:

```bash
sudo /opt/hustl/backup.sh
systemctl status hustl-backup.timer
```

Snapshots live in `/opt/hustl/data/backups` (seven, rotated by the app) and as a copy in `/opt/hustl/backups` (14 days). For an offsite backup, `backup.sh` can use restic:

```bash
sudo RESTIC_REPOSITORY=sftp:hustl-backup:/ \
     RESTIC_PASSWORD_FILE=/etc/hustl/restic.pass \
     /opt/hustl/backup.sh
```

### Restore

```bash
# Check only, change nothing
sudo /opt/hustl/restore.sh --check /opt/hustl/backups/hustl-2026-11-04.db

# Actually restore (stops the container)
sudo /opt/hustl/restore.sh /opt/hustl/backups/hustl-2026-11-04.db
```

The current database is saved as `hustl.db.before-<timestamp>` first. Restoring without a verified backup is not a good idea.

### Changing the domain

Passkeys are bound to the domain. Changing `HUSTL_DOMAIN` invalidates all existing passkeys. A reset is required afterwards:

```bash
docker exec hustl node dist/server/cli.mjs reset-auth
```

The new bootstrap token is in `/opt/hustl/data/bootstrap-token.txt`.

### Lost your passkey?

If another passkey exists, sign in with it. If not, the only option is the shell reset (see above). That's why you should **store recovery codes separately from the device** and add a second device with a code when needed.

## Technical overview

- **Stack:** Electron 42, TypeScript, React 19, Vite 7, Tailwind 3
- **Server:** Fastify 5, `node:sqlite` (no native dependencies), Chromium for PDF, `node-zugferd` for e-invoices
- **Operations:** Docker, non-root container, read-only rootfs, 1 GB memory limit, no publicly exposed port in `bundled` mode
- **Security:** WebAuthn passkeys, HttpOnly session cookies, CSRF protection and rate limits; TLS via the reverse proxy (Caddy in `bundled` mode)
- **Data:** `/data/hustl.db`, PDFs under `/data/invoices`, `/data/offers`, `/data/expenses`, `/data/statements`, templates under `/data/template`
- **Backup:** SQLite snapshot plus files; optional restic with client-side encryption

```
src/
├─ core/        DB, export, import, bank, receipts (no Electron)
├─ server/      Fastify, auth, RPC, files, archive
├─ renderer/    React UI and PWA
├─ main/        Electron shell and first-run dialog
└─ shared/      types and pure logic
deploy/
├─ Dockerfile
└─ selfhost/    installer, compose, Caddy, backup, restore
```

## Development

Requires Node 24 or newer.

```bash
npm install

npm run dev          # Electron with local IPC (development)
npm run build:web    # build the PWA into dist/web
npm run dev:server   # Fastify on :3000 (after build:web)
npm run icons        # regenerate PWA icons and build/icon.icns
npm test             # unit tests with Vitest
npm run test:e2e     # Playwright against the running instance
```

Build installers (on the target OS or in CI):

```bash
npm run dist:win     # Windows NSIS
npm run dist:mac     # macOS DMG (x64 + arm64)
npm run dist:linux   # Linux AppImage
```

The release workflow `.github/workflows/release.yml` builds all three packages on a `v*` tag and attaches them to the GitHub release.

## Limitations

- **Single user.** Hustl is deliberately not a multi-tenant platform.
- **No offline writing.** The server is the single source of truth; the app is not usable without a connection.
- **Not in the web/PWA version:** SMTP email sending, GoCardless bank sync, Notion import and the template editor on mobile. The packaged desktop client loads the same web UI; these features only exist in the local Electron development mode.
- **Unsigned builds.** Windows SmartScreen and macOS Gatekeeper need a manual approval on first launch.
- **E-invoicing:** Generated files follow EN 16931. Before the first real send, validate a sample invoice with the official KoSIT validator; the library checks the XML structure, not all business rules.
- **Backups are mandatory.** Without a working backup there is no second copy of your data.

## Privacy

Your invoices, clients and receipts live on your VPS — not at Hustl. There is no analytics, no telemetry and no third-party account. Sign-in uses passkeys; no password is stored. Backups leave the server only if you set up restic or another offsite target — and then they are encrypted client-side.

## License

[ISC](LICENSE). Hustl is a personal project that is actively growing.
