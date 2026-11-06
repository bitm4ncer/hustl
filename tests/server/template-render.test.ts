import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { applyMigrations } from '../../src/core/db/migrations'
import { getInvoiceTemplate, saveInvoiceTemplate } from '../../src/core/db/invoice-template'
import { templatePreviewHtml } from '../../src/core/operations'

// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

describe('template rendering', () => {
  it('bettet ein relatives Logo als Data-URI ein', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'hustl-tpl-'))
    mkdirSync(join(dataDir, 'template'), { recursive: true })
    writeFileSync(join(dataDir, 'template', 'logo.png'), PNG)

    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const template = { ...getInvoiceTemplate(db), logoPath: 'template/logo.png' }
    saveInvoiceTemplate(db, template)

    const html = templatePreviewHtml(
      {
        db,
        dataDir,
        platform: { kind: 'web', dataDir, renderPdf: async () => new Uint8Array() },
      },
      getInvoiceTemplate(db)
    )
    expect(html).toContain('data:image/png;base64')
  })
})
