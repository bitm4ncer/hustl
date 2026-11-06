import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

describe('editor mobile', () => {
  for (const page of ['src/renderer/pages/InvoiceEditor.tsx', 'src/renderer/pages/OfferEditor.tsx']) {
    it(`${page} nutzt die klebende leiste`, () => {
      expect(readFileSync(page, 'utf8')).toContain('StickyActions')
    })
  }

  it('field unterstuetzt dezimal-tastatur und fokus-scroll', () => {
    const field = readFileSync('src/renderer/components/Field.tsx', 'utf8')
    expect(field).toContain("inputMode")
    expect(field).toContain('scrollIntoView')
  })
})
