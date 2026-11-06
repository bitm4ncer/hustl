# Phase-0-Spikes

Datum: 2026-11-02

## 1. `node:sqlite` unter Node 24

**Frage:** Läuft `node:sqlite` im Container ohne `--experimental-sqlite`?

**Aufbau:** `node:24-bookworm-slim` (Digest
`sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c`),
In-Memory-DB, Tabelle anlegen, Zeile schreiben und lesen.

```bash
docker run --rm node:24-bookworm-slim node -e "const {DatabaseSync}=require('node:sqlite'); …"
```

**Ergebnis:** `[{"x":1}]` — funktioniert ohne Flag.

**Konsequenz:** Kein `better-sqlite3`, kein natives Build im Image. Die
„Release candidate"-Warnung aus der Node-Doku bleibt bestehen; der Zugriff bleibt
hinter `src/core/db/connection.ts` isoliert.

## 2. Chromium-PDF-Parität

**Status:** offen — wird in Task 15 ausgeführt, sobald das Laufzeit-Image mit
Chromium existiert. Vorher gibt es keinen Renderer, gegen den man messen könnte.

**Akzeptanz:** Textinhalt identisch zu den heutigen Electron-PDFs, gleiche
Seitenzahl, keine fehlenden Blöcke. Abweichungen werden hier mit Datum notiert.

## 3. WebAuthn in der Electron-Shell

**Status:** offen — wird in Task 17 ausgeführt, sobald die Shell gegen die
gehostete App läuft.

**Frage:** Liefert `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()`
in der gepackten App `true`?

**Konsequenz bei `false`:** Browser-Handoff nach Spec §13.5 (Login im
Systembrowser, Session-Übergabe per Custom Protocol).
