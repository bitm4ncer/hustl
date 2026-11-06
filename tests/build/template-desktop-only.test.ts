import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('template editor desktop only', () => {
  it('ist unter lg gesperrt und erklaert warum', () => {
    const source = readFileSync('src/renderer/pages/InvoiceTemplate.tsx', 'utf8')
    expect(source).toContain('hidden lg:block')
    expect(source).toContain('lg:hidden')
  })

  it('bietet den vollstaendigen datenexport in den einstellungen', () => {
    const source = readFileSync('src/renderer/pages/Settings.tsx', 'utf8')
    expect(source).toContain('/api/export/full')
  })
})
