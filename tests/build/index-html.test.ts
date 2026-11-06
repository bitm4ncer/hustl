import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('index.html', () => {
  const html = readFileSync('src/renderer/index.html', 'utf8')

  it('ist deutsch und safe-area-faehig', () => {
    expect(html).toContain('lang="de"')
    expect(html).toContain('viewport-fit=cover')
  })

  it('verlinkt manifest und apple-touch-icon', () => {
    expect(html).toContain('manifest.webmanifest')
    expect(html).toContain('apple-touch-icon')
  })

  it('hat favicons fuer den browser-tab', () => {
    expect(html).toContain('rel="icon"')
    expect(html).toContain('favicon-32.png')
    expect(html).toContain('image/svg+xml')
  })
})
