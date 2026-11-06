import type { DatabaseSync } from 'node:sqlite'
import type { InvoiceTemplate } from '@shared/types'
import { DEFAULT_TEMPLATE } from '@shared/template-defaults'

export function getInvoiceTemplate(db: DatabaseSync): InvoiceTemplate {
  const row = db.prepare('SELECT data FROM invoice_template WHERE id = 1').get() as
    | { data: string }
    | undefined
  return row ? { ...DEFAULT_TEMPLATE, ...JSON.parse(row.data) } : DEFAULT_TEMPLATE
}

export function saveInvoiceTemplate(db: DatabaseSync, t: InvoiceTemplate): void {
  db.prepare(
    'INSERT INTO invoice_template (id, data) VALUES (1, @data) ON CONFLICT(id) DO UPDATE SET data = @data',
  ).run({ data: JSON.stringify(t) })
}
