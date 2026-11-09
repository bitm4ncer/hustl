export interface ServerConfig {
  /** Wurzel aller Nutzdaten (DB, PDFs, Logos). */
  dataDir: string
  /** Exakte Origin für CSRF-Prüfung und WebAuthn, z. B. https://hustl.bitmancer.net */
  origin: string
  /** WebAuthn Relying Party ID, z. B. hustl.bitmancer.net */
  rpId: string
  port: number
  /** Cookies nur über HTTPS senden. In Tests/Dev aus. */
  secureCookies: boolean
  /** Lokaler Betrieb: kein Passkey-Login, nur Loopback. */
  local?: boolean
  /** Proxy-Header auswerten. Im lokalen Betrieb aus. */
  trustProxy?: boolean
  /** Wurzel des Web-Builds. */
  webRoot?: string
}

export function isLoopbackAddress(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const origin = env.HUSTL_ORIGIN ?? 'http://localhost:3000'
  const url = new URL(origin)
  const local = env.HUSTL_LOCAL === '1'
  if (local && url.hostname !== 'localhost' && !isLoopbackAddress(url.hostname)) {
    throw new Error('HUSTL_LOCAL erfordert eine Loopback-Origin (127.0.0.1, ::1 oder localhost)')
  }
  return {
    dataDir: env.HUSTL_DATA_DIR ?? './data',
    origin,
    rpId: env.HUSTL_RP_ID ?? url.hostname,
    port: Number(env.PORT ?? env.HUSTL_PORT ?? 3000),
    secureCookies: origin.startsWith('https://'),
    local,
    trustProxy: !local,
    webRoot: env.HUSTL_WEB_ROOT,
  }
}
