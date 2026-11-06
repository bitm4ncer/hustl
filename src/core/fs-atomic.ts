import { promises as fs } from 'node:fs'
import path from 'node:path'

/**
 * Schreibt eine Datei atomar: erst in eine temporäre Datei im selben
 * Verzeichnis, dann umbenennen. Ein Absturz oder voller Datenträger darf ein
 * bereits ausgestelltes Rechnungs-PDF niemals halb überschreiben.
 */
export async function writeFileAtomic(file: string, data: Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.tmp-${process.pid}-${Date.now()}`
  try {
    await fs.writeFile(temp, data)
    await fs.rename(temp, file)
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => undefined)
    throw error
  }
}
