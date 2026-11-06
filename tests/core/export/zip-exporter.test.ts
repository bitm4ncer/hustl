import { describe, it, expect } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { applyMigrations } from '../../../src/core/db/migrations'
import { createClient } from '../../../src/core/db/clients'
import { createExpense } from '../../../src/core/db/expenses'
import { exportMonth } from '../../../src/core/export/zip-exporter'

async function tmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'hustl-zip-'))
}

describe('exportMonth', () => {
  it('writes two zips containing the month PDFs', async () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const work = await tmpDir()
    const out = await tmpDir()

    // an invoice PDF for June
    const cid = createClient(db, { notionId: null, name: 'C', contactPerson: '', addressExtra: '', address: '', street: '', zip: '', city: '', country: '', email: '', hourlyRate: 0, noTax: false, vatId: null, notes: '' })
    const invPdf = path.join(work, 'rechnung.pdf')
    await fs.writeFile(invPdf, '%PDF-1.4 invoice')
    db.prepare("INSERT INTO invoices (number, client_id, date, status, pdf_path) VALUES ('2026010', ?, '2026-06-10', 'finalized', ?)").run(cid, invPdf)

    // a CANCELLED invoice in June keeps its PDF and belongs in the export —
    // otherwise the number sequence looks like it has a gap.
    const cancPdf = path.join(work, 'storno.pdf')
    await fs.writeFile(cancPdf, '%PDF-1.4 cancelled')
    db.prepare("INSERT INTO invoices (number, client_id, date, status, pdf_path, updated_at) VALUES ('2026011', ?, '2026-06-12', 'cancelled', ?, '2026-06-12 10:00:00')").run(cid, cancPdf)

    // an expense PDF for June
    const expPdf = path.join(work, 'beleg.pdf')
    await fs.writeFile(expPdf, '%PDF-1.4 expense')
    createExpense(db, { vendor: 'Adobe', category: '', date: '2026-06-05', paidAt: '2026-06-05', gross: 71.39, vatRate: 19, note: '', pdfPath: expPdf, sourceName: 'beleg.pdf', originalAmount: null, originalCurrency: 'EUR' })

    const res = await exportMonth(db, '2026-06', out)
    expect(res.invoices).toBe(1)
    expect(res.expenses).toBe(1)
    expect(res.files).toHaveLength(2)

    const invZip = await JSZip.loadAsync(await fs.readFile(path.join(out, 'Rechnungen-2026-06.zip')))
    expect(Object.keys(invZip.files)).toEqual(
      expect.arrayContaining(['2026010.pdf']),
    )
    const expZip = await JSZip.loadAsync(await fs.readFile(path.join(out, 'Ausgaben-2026-06.zip')))
    expect(Object.keys(expZip.files).length).toBe(1)
  })

  it('ignores PDFs outside the month', async () => {
    const db = new DatabaseSync(':memory:')
    applyMigrations(db)
    const out = await tmpDir()
    const res = await exportMonth(db, '2026-06', out)
    expect(res.invoices).toBe(0)
    expect(res.expenses).toBe(0)
  })
})
