import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'
import { getSettings } from '../db/settings'
import { saveStatement, upsertTransaction } from '../db/bank'
import { parseStatement, mapStatementTx } from './parse-statement'
import { toStoredPath } from '../paths'

const ACCOUNT_ID = 'n26-statement'

/**
 * Parst einen N26-Kontoauszug aus bereits gelesenen Bytes und persistiert ihn.
 *
 * Der Electron-Adapter öffnet den Dateidialog und reicht die Bytes herein; der
 * Server bekommt sie aus dem Upload. `dataDir` ist der Wurzelpfad der Nutzdaten.
 */
export async function importStatement(
  db: DatabaseSync,
  bytes: Uint8Array,
  filename: string,
  dataDir: string
): Promise<{ yearMonth: string; imported: number; ignored: number }> {
  const { getDocumentProxy, extractText } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(bytes))
  const res = await extractText(pdf, { mergePages: true })
  const text = typeof res.text === 'string' ? res.text : (res.text as string[]).join('\n')

  const settings = getSettings(db)
  const parsed = parseStatement(text, {
    ownNames: [settings.name, settings.recipientName].filter((s) => s.trim() !== ''),
  })
  if (parsed.transactions.length === 0) {
    throw new Error(
      `Keine Transaktionen in "${filename}" gefunden — ist das ein N26-Kontoauszug?`
    )
  }

  let imported = 0
  let ignored = 0
  for (const tx of parsed.transactions) {
    upsertTransaction(db, mapStatementTx(tx, ACCOUNT_ID))
    if (tx.internal) ignored++
    else imported++
  }

  // Persist the PDF for the monthly export (one per month; overwrite on re-import).
  const dir = path.join(dataDir, 'statements')
  await fs.mkdir(dir, { recursive: true })
  const destPath = path.join(dir, `${parsed.yearMonth}.pdf`)
  await fs.writeFile(destPath, Buffer.from(bytes))
  saveStatement(db, { yearMonth: parsed.yearMonth, pdfPath: toStoredPath(dataDir, destPath) })

  return { yearMonth: parsed.yearMonth, imported, ignored }
}
