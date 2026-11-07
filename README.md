<p align="center">
  <img src="resources/icon.png" alt="Hustl" width="96">
</p>

<h1 align="center">Hustl</h1>

<p align="center">
  <strong>English</strong> · <a href="README.de.md">Deutsch</a>
</p>

<p align="center">
  <strong>Invoices, offers and finances for freelancers.</strong><br>
  Self-hosted on your own server. No cloud, no account, no telemetry.
</p>

<p align="center">
  <a href="https://bitm4ncer.github.io/hustl/"><img alt="Website" src="https://img.shields.io/badge/website-hustl-ff8c66"></a>
  <a href="https://github.com/bitm4ncer/hustl/releases/latest"><img alt="Download for Windows, macOS and Linux" src="https://img.shields.io/badge/download-Windows%20%7C%20macOS%20%7C%20Linux-555"></a>
  <a href="LICENSE"><img alt="License: ISC" src="https://img.shields.io/badge/license-ISC-blue"></a>
  <img alt="Self-hosted with Docker" src="https://img.shields.io/badge/self--hosted-Docker-2496ED?logo=docker&logoColor=white">
</p>

---

Hustl is an invoicing and finance app for freelancers and small studios in Germany. It runs on a small server that you rent yourself. Your invoices, clients and receipts stay there — not with us. Use Hustl in the browser, install it on your phone as an app, or use the desktop app for Windows, macOS and Linux.

<p align="center">
  <a href="https://bitm4ncer.github.io/hustl/"><strong>Website & screenshots →</strong></a>
</p>

## Is Hustl for you?

Hustl is a good fit if you:

- work as a freelancer or run a small studio,
- want invoices, offers, projects, tasks and finances in one place,
- want your data on your own server instead of someone else's cloud,
- are okay with a small server that costs about **5–15 € per month**.

Hustl is **not** a good fit if you need a multi-user team platform, want a fully hosted service with no setup, or need to work completely offline.

## What Hustl does

- **Invoices** — create, number, finalize and download as PDF.
- **E-invoices** — hybrid PDF/A-3 files according to EN 16931 (ZUGFeRD / Factur-X).
- **Offers** — versions, status and PDF; turn an accepted offer into a client and project.
- **Clients and projects** — hourly rates, fixed prices, line items and open items.
- **Finance** — income, expenses, fixed costs, dashboard, forecast and monthly export.
- **Receipts and bank statements** — upload PDFs and match payments to invoices.
- **Planner and tasks** — dated tasks for the next 15 days, recurring routines that reset daily, weekly or monthly, and free lists for undated ideas.
- **German and English** UI and document language, with 12 currencies.
- **Full archive** — one ZIP with the database, all PDFs and CSV files.

## See it

<p align="center">
  <img src="site/assets/screens/invoices.webp" alt="Hustl invoice list with demo data" width="860"><br>
  <sub>Demo data — all names, addresses and amounts are fictional.</sub>
</p>

<p align="center">
  <a href="https://bitm4ncer.github.io/hustl/"><strong>More screenshots on the website →</strong></a>
</p>

## Start in three steps

You need two things: a small server (a **VPS**, a computer you rent by the month) and a domain that points to it. A VPS with 2 GB RAM is enough and costs roughly 5–15 € per month. Point the domain at it; DNS can take a little while to propagate.

### 1. Get a server and a domain

Use Debian 12/13 or Ubuntu 22.04/24.04 with at least 2 vCPU, 2 GB RAM (4 GB recommended) and 20 GB free disk recommended. Point the A record of a domain such as `hustl.example.com` to the server (AAAA only if you use IPv6). Ports 22, 80 and 443 must be open.

If you have never done this: the [agent guide](INSTALL-WITH-AGENT.md) walks you through it step by step, including choosing a VPS and setting up DNS.

### 2. Run the installer

Connect to the server with SSH and run:

```bash
sudo mkdir -p /opt/hustl
sudo chown "$USER":"$USER" /opt/hustl
git clone https://github.com/bitm4ncer/hustl.git /opt/hustl/src
cd /opt/hustl/src
sudo ./deploy/selfhost/install.sh
```

The installer asks for your domain and an email address for the HTTPS certificate. It then builds Hustl, starts Docker, sets up HTTPS (in bundled mode), autostart and a daily database snapshot at 03:30. The image is built on the server; on a small VPS the first build can take 15–30 minutes.

### 3. Create your passkey

Open the setup link printed by the installer:

```text
https://<your-domain>/setup?token=…
```

Create your first passkey — Face ID, Touch ID, Windows Hello or a security key — and store the **ten recovery codes** somewhere safe. The setup link can only be used once.

That's it. Open `https://<your-domain>` in your browser and start working.

> **Already running a web server on ports 80/443?** The installer detects it and switches to `external` mode. Hustl then listens only on `127.0.0.1:3000`; a ready-made proxy block is written to `/opt/hustl/Caddyfile.snippet`. Force it with `HUSTL_PROXY=external`. If Caddy itself runs in a container, use `HUSTL_PROXY=external PROXY_NETWORK=web` and `/opt/hustl/Caddyfile.docker.snippet`.

## Install with an agent

If you don't want to type the commands yourself, open [`INSTALL-WITH-AGENT.md`](INSTALL-WITH-AGENT.md) and copy the prompt into your AI assistant. The agent asks about your VPS, SSH access, domain, firewall and backups, then guides you through each step and checks the result. The guide is currently in German.

## Download the desktop app

The desktop app is a slim Electron shell around the same web interface. It is **not a standalone server**: on first launch it asks for your reachable Hustl server URL.

| Platform | Download | Notes |
|---|---|---|
| Windows | [Hustl for Windows](https://github.com/bitm4ncer/hustl/releases/latest/download/Hustl-win.exe) | Installer, 64-bit |
| macOS (Apple Silicon) | [Hustl for macOS arm64](https://github.com/bitm4ncer/hustl/releases/latest/download/Hustl-mac-arm64.dmg) | Apple Silicon |
| macOS (Intel) | [Hustl for macOS x64](https://github.com/bitm4ncer/hustl/releases/latest/download/Hustl-mac-x64.dmg) | Intel Macs |
| Linux | [Hustl for Linux](https://github.com/bitm4ncer/hustl/releases/latest/download/Hustl-linux.AppImage) | AppImage, x86_64 |

Or browse [all releases](https://github.com/bitm4ncer/hustl/releases/latest).

The builds are **unsigned**, so you need to allow them once:

- **Windows:** "More info" → "Run anyway".
- **macOS:** right-click the app → "Open" → "Open", or run `xattr -dr com.apple.quarantine /Applications/Hustl.app`.
- **Linux:** `chmod +x Hustl-linux.AppImage && ./Hustl-linux.AppImage`.

### PWA: no download at all

The PWA is the easiest way to use Hustl on any device:

1. Open your Hustl URL in the browser and sign in with your passkey.
2. Choose **Install app** in Chrome/Edge, or **Add to Home Screen** in Safari on iOS.
3. The app starts without browser chrome and unlocks with Face ID or Windows Hello.

Works on Windows, macOS, Linux, iPhone, iPad and Android.

## What it costs

Hustl is free and open source under the ISC license. There is no subscription and no license fee.

| Item | Typical cost |
|---|---|
| Hustl | 0 € |
| VPS (2 GB RAM, 4 GB recommended) | about 5–15 € / month |
| Domain | about 5–30 € / year (0.40–2.50 € / month) |

The domain price depends on the TLD and the registrar. A `.de` domain often costs around 5–20 € per year, a `.com` around 15–30 €; first-year offers are often cheaper than renewals. You pay your server provider directly. Hustl never sees your invoices or customer data.

## Where can Hustl run?

Hustl is a Docker container with a SQLite database. It needs a Linux host with Docker and a persistent volume.

| Option | Good for | Notes |
|---|---|---|
| **Own VPS** | most users | Hetzner, Netcup, IONOS, Contabo or another provider. The installer sets up Docker, HTTPS (in bundled mode) and backups. |
| **Existing server / NAS** | you already run Docker | Linux server, Synology/QNAP with Docker or a home server. The installer targets Debian/Ubuntu; on a NAS, use `compose.external.yml` manually, and configure the reverse proxy and backups yourself. |
| **Raspberry Pi / home server** | privacy and one-time hardware | Needs Docker on arm64 and at least 4 GB RAM recommended. Use Cloudflare Tunnel or Tailscale Funnel for external access; plan for stable power and backups. |
| **PaaS / Kubernetes** | experienced operators | Railway, Render, Fly.io or a cluster can work if the SQLite file lives on a persistent, block-backed volume with one replica (no NFS/SMB). Shared hosting, Vercel/Netlify and serverless platforms without a persistent disk do not work. |

A free cloud allowance (for example Oracle Cloud Free Tier on ARM) can be enough for testing, but availability and terms change. There is no official hosted Hustl service.

**The desktop app is not a hosting option.** It is a shell around your web instance and needs a reachable Hustl URL.

## FAQ

**Do I need to be technical?**
A little. You need to copy three commands and point a domain at your server. If that sounds unpleasant, use the [agent guide](INSTALL-WITH-AGENT.md) — it asks the questions and walks you through the installation. You can also ask a friend or colleague to run the installer; it is a one-time job.

**Where is my data?**
In a SQLite database and as PDFs on your own server. There is no cloud, no account with us and no analytics. Backups only leave the server if you set up an offsite target such as restic.

**Can I use Hustl on my phone?**
Yes. Install it as a PWA: open the URL in Safari, tap Share and choose "Add to Home Screen". Sign-in uses Face ID or Touch ID. There is no App Store app.

**What is a passkey?**
A passwordless login using Face ID, Touch ID, Windows Hello or a security key. You can add more devices later with a recovery code. Store the ten recovery codes separately from your phone or laptop.

**Is it secure?**
Hustl uses WebAuthn passkeys, HttpOnly session cookies, CSRF protection and rate limits. HTTPS is handled by your reverse proxy — Caddy in the bundled setup. You are responsible for server updates and backups; the installer creates a daily database snapshot. PDFs, receipts and statements are only included if you use restic or download the full archive.

**Can I export my data?**
Yes. Download a full archive as a ZIP with the database, all PDFs and CSV files. For your tax adviser there is also a monthly export.

**Can I import data from another tool?**
Bank statements and receipt PDFs can be imported. There is no universal one-click importer for invoices from other tools, so a migration usually needs a small script or manual work.

**Does Hustl support e-invoicing?**
Yes. Hustl creates hybrid PDF/A-3 files according to EN 16931 (ZUGFeRD / Factur-X). It checks the data model, not full XSD/Schematron conformance. Before the first real send, validate a sample invoice with the official KoSIT validator.

**Is there a hosted version?**
No. Hustl is deliberately self-hosted so your data stays with you. You can run it on a server of your choice, including a server from a hosting provider.

## Good to know

- **Single user.** One person per instance; you can use multiple passkeys and devices, but there are no roles, teams or separate user accounts.
- **The server must be online.** There is no offline writing mode; the server is the single source of truth.
- **Not included:** SMTP email sending, GoCardless bank sync and Notion import are not part of Hustl 1.1.1. The template editor is available in the web UI.
- **Unsigned builds.** Windows SmartScreen and macOS Gatekeeper ask for approval on first launch.
- **Backups are mandatory.** Without a working backup there is no second copy of your data.
- **E-invoicing needs a test.** Validate a sample with the KoSIT validator before sending real e-invoices.

## Technical details

<details>
<summary><strong>Requirements and detailed installation</strong></summary>

| | |
|---|---|
| Server | 2 vCPU, at least 2 GB RAM (4 GB recommended), 20 GB free disk recommended |
| OS | Debian 12/13 or Ubuntu 22.04/24.04, x86_64 or arm64 |
| Domain | e.g. `hustl.example.com`, A record (and AAAA for IPv6) pointing to the VPS |
| Time | about 15–30 minutes, plus DNS propagation |
| Ports | 22 (SSH), 80 and 443 open |
| Access | SSH access with a key or password |
| Tools | `git` for the clone (and updates); the installer installs `curl` and `git` if needed |

The installer supports two modes:

- **`bundled`** (default when ports 80/443 are free): Hustl plus Caddy with automatic HTTPS.
- **`external`** (when a web server is already running): Hustl listens on `127.0.0.1:3000` and you proxy to it.

Non-interactive installation:

```bash
sudo HUSTL_DOMAIN=hustl.example.com \
     ACME_EMAIL=you@example.com \
     HUSTL_ASSUME_YES=1 \
     ./deploy/selfhost/install.sh
```

Useful environment variables: `HUSTL_DOMAIN`, `ACME_EMAIL`, `HUSTL_PROXY`, `HUSTL_DIR`, `HUSTL_PORT`, `PROXY_NETWORK`, `HUSTL_ASSUME_YES`.

After installation:

| Task | Where |
|---|---|
| Sign in | `https://<your-domain>` |
| First start / passkey | `https://<your-domain>/setup?token=…` |
| Add another device | Login → "Lost your passkey?" → recovery code |
| Download full archive | Settings → Data → "Download archive" |
| Logs | `docker logs -f hustl` |
| Caddy logs (bundled mode) | `docker logs -f hustl-caddy` |
| Data | `/opt/hustl/data` |
| Configuration | `/opt/hustl/.env` |

</details>

<details>
<summary><strong>Updates, backups, restore and domain changes</strong></summary>

### Update

```bash
cd /opt/hustl/src
git pull
sudo ./deploy/selfhost/install.sh
```

The installer rebuilds the image and restarts the containers. Data stays untouched; `.env` is regenerated from the installer's current values, so put custom settings in the supported variables or keep a copy.

### Backup

The installer sets up a systemd timer that creates a consistent SQLite snapshot every day at 03:30. **This snapshot contains the database only.** PDFs, receipts and bank statements are included only when you run restic against `/opt/hustl/data` or download the full archive.

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

The current database is saved as `hustl.db.before-<timestamp>` first. Restoring without a verified backup is not a good idea. `restore.sh` restores the database only; restore PDFs and receipts from restic or the full archive separately.

### Changing the domain

Passkeys are bound to the domain. Changing `HUSTL_DOMAIN` invalidates all existing passkeys. A reset is required afterwards:

```bash
docker exec hustl node dist/server/cli.mjs reset-auth
```

The new bootstrap token is in `/opt/hustl/data/bootstrap-token.txt`.

### Lost your passkey?

If another passkey exists, sign in with it. If not, the only option is the shell reset above. That's why you should **store recovery codes separately from the device** and add a second device with a code when needed.

</details>

<details>
<summary><strong>Technology and development</strong></summary>

- **Stack:** Electron 42, TypeScript, React 19, Vite 7, Tailwind 3
- **Server:** Fastify 5, `node:sqlite` (no native dependencies), Chromium for PDF, `node-zugferd` for e-invoices
- **Operations:** Docker, non-root container, read-only rootfs, 1 GB memory limit, no publicly exposed port in `bundled` mode
- **Security:** WebAuthn passkeys, HttpOnly session cookies, CSRF protection and rate limits; TLS via the reverse proxy (Caddy in `bundled` mode)
- **Data:** `/data/hustl.db`, PDFs under `/data/invoices`, `/data/offers`, `/data/expenses`, `/data/statements`, templates under `/data/template`
- **Backup:** daily SQLite snapshot; full files via restic or the archive. restic encrypts client-side; other targets are your responsibility.

```text
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

The release workflow `.github/workflows/release.yml` builds all three packages on a `v*` tag and attaches them to the GitHub release. The landing page is in `site/` and is deployed to GitHub Pages by `.github/workflows/pages.yml`.

</details>

## Privacy

Your invoices, clients and receipts live on your server — not at Hustl. There is no analytics, no telemetry and no third-party account. Sign-in uses passkeys; no password is stored. Backups leave the server only if you set up restic or another offsite target. restic encrypts client-side; with other targets, encryption is your responsibility.

## License

[ISC](LICENSE). Hustl is a personal project that is actively growing.
