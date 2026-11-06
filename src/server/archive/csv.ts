import type { DatabaseSync } from 'node:sqlite'

function escapeCell(value: unknown): string {
  if (value == null) return ''
  const text = String(value)
  if (/[;"\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

/** CSV mit Semikolon und Dezimalkomma-freundlichem Inhalt (deutsches Excel). */
export function tableCsv(db: DatabaseSync, table: string): string {
  const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(
    (column) => column.name
  )
  if (columns.length === 0) return ''
  const rows = db.prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>
  const lines = [columns.join(';')]
  for (const row of rows) lines.push(columns.map((column) => escapeCell(row[column])).join(';'))
  return lines.join('\r\n') + '\r\n'
}

const TABLES = [
  'clients',
  'projects',
  'project_items',
  'invoices',
  'invoice_items',
  'offers',
  'offer_items',
  'expenses',
  'fixed_costs',
  'bank_transactions',
  'audit_log',
]

export function buildCsvFiles(db: DatabaseSync): Record<string, string> {
  const files: Record<string, string> = {}
  for (const table of TABLES) files[`csv/${table}.csv`] = tableCsv(db, table)
  return files
}
