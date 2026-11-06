import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const pages = [
  'src/renderer/pages/Invoices.tsx',
  'src/renderer/pages/Offers.tsx',
  'src/renderer/pages/Clients.tsx',
  'src/renderer/pages/Projects.tsx',
  'src/renderer/pages/finance/Expenses.tsx',
  'src/renderer/pages/finance/FixedCosts.tsx',
]

describe('responsive lists', () => {
  it('keine seite rendert eine breite tabelle', () => {
    for (const page of pages) {
      const source = readFileSync(page, 'utf8')
      expect(source, page).not.toMatch(/<table/)
    }
  })

  it('lange namen und ibans brechen um statt zu ueberlaufen', () => {
    for (const page of pages) {
      const source = readFileSync(page, 'utf8')
      expect(source, page).toMatch(/break-words/)
    }
  })
})
