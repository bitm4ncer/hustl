/**
 * Zerlegt eine Freitext-Projektbeschreibung in Positions-Texte — die einmalige
 * Backfill-Heuristik der project_items-Migration.
 *
 * Regeln: Zeilen, die mit einem Aufzählungszeichen beginnen (`- `, `– `, `• `,
 * `* `), starten eine neue Position (Zeichen wird entfernt). Zeilen ohne
 * Aufzählungszeichen hängen an der vorherigen Position (bzw. starten die erste).
 * Leerzeilen trennen nur. Text ganz ohne Aufzählungszeichen ⇒ eine Position.
 */
export function splitDescriptionToItems(description: string): string[] {
  const items: string[] = []
  let current = ''
  for (const raw of description.split('\n')) {
    const line = raw.trim()
    if (line === '') continue
    const m = line.match(/^[-–—•*]\s+(.*)$/)
    if (m) {
      if (current !== '') items.push(current)
      current = m[1].trim()
    } else {
      current = current === '' ? line : `${current} ${line}`
    }
  }
  if (current !== '') items.push(current)
  return items
}
