import { round2 } from './money'

/** Was ein Projekt an Stunden trägt: entweder das eigene Feld oder die Positionen. */
export interface HoursSource {
  hours: number | null
  items: ReadonlyArray<{ hours: number | null }>
}

/**
 * Die Stunden, mit denen ein Projekt rechnet. Das Stundenfeld des Projekts
 * gewinnt, damit eine bewusst abweichende Zahl (Nachlass, Pauschale) bestehen
 * bleibt. Ist es leer, zählt die Summe der Positions-Stunden. `null`, wenn
 * weder das Feld gefüllt ist noch eine Position Stunden trägt.
 */
export function projectHours(p: HoursSource): number | null {
  if (p.hours != null) return p.hours
  const sum = round2(p.items.reduce((s, it) => s + (it.hours ?? 0), 0))
  return sum > 0 ? sum : null
}
