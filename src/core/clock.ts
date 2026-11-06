/**
 * „Heute" in Europe/Berlin. Nummernkreise, Monatsgrenzen und Belegdaten hängen
 * an der deutschen Zeitzone, nicht an UTC.
 */
export function todayInBerlin(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}
