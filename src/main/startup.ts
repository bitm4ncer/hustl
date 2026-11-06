import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type StartupTarget =
  | { mode: 'local' }
  | { mode: 'remote'; url: string }
  | { mode: 'setup' }

const CONFIG_FILE = 'server.json'

/**
 * Akzeptiert `hustl.example.com`, `https://hustl.example.com/` oder
 * `http://localhost:3000`. Liefert eine kanonische URL ohne abschliessenden
 * Slash oder `null`, wenn die Eingabe kein brauchbarer Server ist.
 *
 * Ein Pfad ist erlaubt (Reverse Proxy unter `/hustl`), Query, Fragment und
 * Zugangsdaten sind es nicht.
 */
export function normalizeServerUrl(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null

  let url: URL
  try {
    url = new URL(raw.includes('://') ? raw : `https://${raw}`)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password) return null
  if (url.search || url.hash) return null

  const path = url.pathname.replace(/\/+$/, '')
  return `${url.origin}${path}`
}

export function readServerConfig(userDataDir: string): string | null {
  const file = join(userDataDir, CONFIG_FILE)
  if (!existsSync(file)) return null

  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { url?: unknown }
    return typeof parsed.url === 'string' ? normalizeServerUrl(parsed.url) : null
  } catch {
    return null
  }
}

export function writeServerConfig(userDataDir: string, url: string): string {
  const normalized = normalizeServerUrl(url)
  if (!normalized) throw new Error('Ungültige Server-URL')

  mkdirSync(userDataDir, { recursive: true })
  writeFileSync(join(userDataDir, CONFIG_FILE), `${JSON.stringify({ url: normalized }, null, 2)}\n`, {
    mode: 0o600
  })
  return normalized
}

/**
 * Verpackt lädt die App die konfigurierte Instanz. Fehlt sie, zeigt der
 * Erststart den Einrichtungsdialog. Im Dev-Modus bleibt der lokale IPC-Pfad.
 * `HUSTL_REMOTE_URL` überschreibt beides (Tests, Staging).
 */
export function resolveStartupTarget(options: {
  isPackaged: boolean
  env: NodeJS.ProcessEnv
  storedUrl?: string | null
}): StartupTarget {
  const override = options.env.HUSTL_REMOTE_URL
    ? normalizeServerUrl(options.env.HUSTL_REMOTE_URL)
    : null
  if (override) return { mode: 'remote', url: override }

  if (!options.isPackaged) return { mode: 'local' }

  const stored = options.storedUrl ? normalizeServerUrl(options.storedUrl) : null
  return stored ? { mode: 'remote', url: stored } : { mode: 'setup' }
}
