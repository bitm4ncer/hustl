import type { DatabaseSync } from 'node:sqlite'

export function appendAudit(
  db: DatabaseSync,
  entry: { invoiceId: number | null; action: string; payload?: unknown }
): void {
  db.prepare('INSERT INTO audit_log (invoice_id, action, payload) VALUES (?, ?, ?)').run(
    entry.invoiceId,
    entry.action,
    entry.payload ? JSON.stringify(entry.payload) : null
  )
}
