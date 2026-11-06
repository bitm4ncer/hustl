export interface ServerConfig {
  /** Wurzel aller Nutzdaten (DB, PDFs, Logos). */
  dataDir: string
  /** Exakte Origin für CSRF-Prüfung und WebAuthn, z. B. https://hustl.example.com */
  origin: string
  /** WebAuthn Relying Party ID, z. B. hustl.example.com */
  rpId: string
  port: number
  /** Cookies nur über HTTPS senden. In Tests/Dev aus. */
  secureCookies: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const origin = env.HUSTL_ORIGIN ?? 'http://localhost:3000'
  const url = new URL(origin)
  return {
    dataDir: env.HUSTL_DATA_DIR ?? './data',
    origin,
    rpId: env.HUSTL_RP_ID ?? url.hostname,
    port: Number(env.PORT ?? env.HUSTL_PORT ?? 3000),
    secureCookies: origin.startsWith('https://'),
  }
}
