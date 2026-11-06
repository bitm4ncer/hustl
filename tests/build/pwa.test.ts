import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'

describe('pwa', () => {
  it('konfiguriert das plugin nur fuer den web-build', () => {
    const config = readFileSync('vite.web.config.ts', 'utf8')
    expect(config).toContain('VitePWA')
    expect(config).toContain('registerType')
    expect(config).toContain("handler: 'NetworkFirst'")
    expect(config).toContain('navigateFallback: null')
  })

  it('hat alle icons', () => {
    for (const icon of [
      'icon-192-v2.png',
      'icon-512-v2.png',
      'icon-maskable-512-v2.png',
      'apple-touch-icon-v2.png',
    ]) {
      expect(existsSync(`src/renderer/public/icons/${icon}`), icon).toBe(true)
    }
  })

  it('registriert den service worker nur im web', () => {
    const register = readFileSync('src/renderer/pwa/register.ts', 'utf8')
    expect(register).toContain("serviceWorker' in navigator")
    expect(register).toContain('hustl')
  })
})
