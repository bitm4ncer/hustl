import type { BankTransaction, Invoice, Expense, FixedCost, MatchSuggestion } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Kalendertage zwischen Belegdatum und Buchung. Positiv = Buchung liegt nach
 * dem Beleg (Normalfall: Karte sofort, PayPal-Lastschrift wenige Tage später).
 * Nur das Datum zählt, nicht die Uhrzeit — sonst kippt das Ergebnis an der
 * Sommerzeit.
 */
function dayGap(expenseDate: string, bookingDate: string): number {
  const from = Date.parse(`${expenseDate.slice(0, 10)}T00:00:00Z`)
  const to = Date.parse(`${bookingDate.slice(0, 10)}T00:00:00Z`)
  return Math.round((to - from) / 86_400_000)
}

/** Tag und Monat für die Vorschlags-Beschriftung, z. B. "22.10.". */
function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`
}

function eur(n: number): string {
  return `${n.toFixed(2).replace('.', ',')} €`
}

// True when the invoice number can be found in the remittance text, tolerant of
// prefixes (RE/RG/Nr/…) and spacing on either side: compare the pure digit core.
function refMatch(remittance: string, invoiceNumber: string | null): boolean {
  if (!invoiceNumber) return false
  const core = invoiceNumber.replace(/\D/g, '')
  if (core.length < 4) return false // too short → would match by accident
  return remittance.replace(/\s/g, '').includes(core)
}

// "Ursprungsbetrag 10.00 USD" (N26-Kartenumsätze in Fremdwährung). Der Betrag
// kann Punkt- oder Komma-Dezimal sein; die Währung ist ein ISO-4217-Code.
const ORIGINAL_RE = /Ursprungsbetrag\s+(\d[\d.,]*)\s+([A-Z]{3})/i

function parseDecimal(s: string): number {
  const sep = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  if (sep === -1) return Number(s)
  const dec = s.slice(sep + 1)
  if (dec.length < 1 || dec.length > 2) return Number(s.replace(/[.,]/g, ''))
  return Number(`${s.slice(0, sep).replace(/[.,]/g, '')}.${dec}`)
}

export function parseOriginalAmount(remittance: string): { amount: number; currency: string } | null {
  const m = remittance.match(ORIGINAL_RE)
  if (!m) return null
  const amount = parseDecimal(m[1])
  if (!Number.isFinite(amount) || amount <= 0) return null
  return { amount, currency: m[2].toUpperCase() }
}

// "Alle eindeutigen übernehmen": eine Transaktion ist nur dann eindeutig, wenn
// alle High-Confidence-Vorschläge auf DASSELBE Ziel zeigen. Zwei 10-USD-Belege
// im selben Zeitfenster sind es nicht — die entscheidet der User manuell.
export function uniqueHighSuggestion(suggestions: MatchSuggestion[]): MatchSuggestion | null {
  const high = suggestions.filter((s) => s.confidence === 'high')
  if (high.length === 0) return null
  const key = (s: MatchSuggestion): string =>
    s.invoiceId !== undefined
      ? `i${s.invoiceId}`
      : s.expenseId !== undefined
        ? `e${s.expenseId}`
        : s.fixedCostId !== undefined
          ? `f${s.fixedCostId}`
          : 'create'
  const first = key(high[0])
  return high.every((s) => key(s) === first) ? high[0] : null
}

// ---------------------------------------------------------------------------
// suggestMatches — pure function (no I/O)
// ---------------------------------------------------------------------------

export function suggestMatches(
  tx: BankTransaction,
  invoices: Invoice[],
  expenses: Expense[],
  fixedCosts: FixedCost[] = [],
  context: ReconcileContext = {},
): MatchSuggestion[] {
  if (tx.kind === 'credit') {
    return suggestCredit(tx, invoices, context)
  } else {
    return suggestDebit(tx, expenses, fixedCosts, context)
  }
}

/** Bereits vergebene Ziele dürfen nicht erneut vorgeschlagen werden. */
export interface ReconcileContext {
  matchedInvoiceIds?: ReadonlySet<number>
  matchedExpenseIds?: ReadonlySet<number>
  matchedFixedCostIds?: ReadonlySet<number>
}

function suggestCredit(
  tx: BankTransaction,
  invoices: Invoice[],
  context: ReconcileContext,
): MatchSuggestion[] {
  const suggestions: MatchSuggestion[] = []
  for (const inv of invoices) {
    if (inv.status === 'cancelled') continue
    if (context.matchedInvoiceIds?.has(inv.id)) continue
    // The invoice number in the remittance is authoritative — match it against
    // any non-cancelled invoice regardless of paid status (links an incoming
    // payment to its invoice, even when the invoice was already marked paid).
    const ref = refMatch(tx.remittance, inv.number)
    // Amount-only matching stays restricted to OPEN invoices, otherwise the pile
    // of already-paid invoices would produce noisy coincidental amount hits.
    const open = inv.status === 'finalized' || inv.status === 'sent'
    const amountEur = inv.total * (inv.exchangeRate > 0 ? inv.exchangeRate : 1)
    const amount = open && Math.abs(amountEur - tx.amount) < 0.01
    if (!ref && !amount) continue
    suggestions.push({
      txId: tx.id,
      kind: 'credit',
      invoiceId: inv.id,
      confidence: ref ? 'high' : 'low',
      label: [inv.number, tx.counterparty].filter(Boolean).join(' · '),
    })
  }

  // Sort: high before low
  suggestions.sort((a, b) => {
    if (a.confidence === b.confidence) return 0
    return a.confidence === 'high' ? -1 : 1
  })

  return suggestions
}

// ---------------------------------------------------------------------------
// Debit → Expense / fixed cost
// ---------------------------------------------------------------------------

/** So weit darf eine Buchung nach dem Beleg liegen (PayPal-Lastschrift u. Ä.). */
const MATCH_WINDOW_DAYS = 14
/** Toleranz, wenn die Buchung den Originalbetrag nicht nennt (PSP-Umrechnung). */
const FX_TOLERANCE = 0.04
/**
 * SEPA-Lastschriften werden typischerweise zwei Bankarbeitstage nach dem Kauf
 * eingezogen. Diese Erwartung entscheidet, welcher Beleg zu einer Buchung
 * gehört — nicht der reine Kalenderabstand, sonst gewinnt am Freitag der Beleg
 * vom selben Tag gegen den von Mittwoch.
 */
const EXPECTED_BUSINESS_DAYS = 2

/**
 * Lastschriften brauchen ein paar Bankarbeitstage, Kartenzahlungen werden am
 * Kauftag gebucht. Der Erwartungswert hängt deshalb an der Buchungsart, nicht
 * am Beleg.
 */
export function expectedBusinessDays(tx: Pick<BankTransaction, 'counterparty' | 'remittance'>): number {
  return /lastschrift|paypal|sepa/i.test(`${tx.counterparty} ${tx.remittance}`)
    ? EXPECTED_BUSINESS_DAYS
    : 0
}

interface Candidate {
  suggestion: MatchSuggestion
  /** Kalendertage Buchung − Beleg; negativ = Beleg liegt nach der Buchung. */
  gap: number
  /** Werktage Buchung − Beleg (ohne Belegtag, mit Buchungstag). */
  business: number
  /** Betrag exakt (EUR oder Originalwährung) statt nur innerhalb der Toleranz. */
  exact: boolean
}

/**
 * Werktage zwischen Beleg und Buchung (ohne Belegtag, mit Buchungstag).
 * Wochenenden zählen nicht — Banken buchen nur an Bankarbeitstagen.
 */
export function businessGap(expenseDate: string, bookingDate: string): number {
  const from = Date.parse(`${expenseDate.slice(0, 10)}T00:00:00Z`)
  const to = Date.parse(`${bookingDate.slice(0, 10)}T00:00:00Z`)
  let count = 0
  for (let t = from + 86_400_000; t <= to; t += 86_400_000) {
    const day = new Date(t).getUTCDay()
    if (day !== 0 && day !== 6) count++
  }
  return count
}

function suggestDebit(
  tx: BankTransaction,
  expenses: Expense[],
  fixedCosts: FixedCost[],
  context: ReconcileContext,
): MatchSuggestion[] {
  const d = Math.abs(tx.amount)
  const suggestions: MatchSuggestion[] = []
  const candidates: Candidate[] = []
  const seen = new Set<number>()
  const expected = expectedBusinessDays(tx)

  // Fixed costs (KSK & Co.) sind bereits in den Büchern — nur verknüpfen.
  for (const fc of fixedCosts) {
    if (!fc.active) continue
    if (context.matchedFixedCostIds?.has(fc.id)) continue
    if (Math.abs(fc.gross - d) < 0.01) {
      suggestions.push({
        txId: tx.id,
        kind: 'debit',
        fixedCostId: fc.id,
        confidence: 'high',
        label: `Fixkosten: ${fc.name} · ${eur(d)}`,
      })
    }
  }

  const orig = parseOriginalAmount(tx.remittance)

  for (const exp of expenses) {
    if (context.matchedExpenseIds?.has(exp.id)) continue

    const gap = dayGap(exp.date, tx.bookingDate)
    // Eine Buchung vor dem Beleg ist praktisch ausgeschlossen; einen Tag
    // Spielraum lassen (Zeitzone, spätabends gebucht).
    if (gap < -1 || gap > MATCH_WINDOW_DAYS) continue

    const eurExact = Math.abs(exp.gross - d) < 0.01
    const fxExact =
      orig !== null &&
      exp.originalCurrency === orig.currency &&
      exp.originalAmount != null &&
      Math.abs(exp.originalAmount - orig.amount) < 0.01

    let exact = false
    if (eurExact || fxExact) {
      exact = true
      suggestions.push({
        txId: tx.id,
        kind: 'debit',
        expenseId: exp.id,
        confidence: 'high',
        label:
          fxExact && !eurExact
            ? `${exp.vendor} · ${shortDate(exp.date)} · ${exp.originalAmount!.toFixed(2)} ${exp.originalCurrency} → ${eur(d)}`
            : `${exp.vendor} · ${shortDate(exp.date)} · ${eur(exp.gross)}`,
      })
    } else if (
      orig === null &&
      exp.originalAmount != null &&
      exp.originalCurrency !== 'EUR' &&
      Math.abs(exp.gross - d) <= d * FX_TOLERANCE
    ) {
      // Kein Originalbetrag auf dem Auszug: die gespeicherte Summe ist eine
      // EZB-Schätzung, die Buchung der echte Karten-/PSP-Kurs.
      suggestions.push({
        txId: tx.id,
        kind: 'debit',
        expenseId: exp.id,
        confidence: 'low',
        label: `${exp.vendor} · ${shortDate(exp.date)} · ca. ${eur(exp.gross)} (${exp.originalCurrency}) ≈ ${eur(d)}`,
      })
    } else {
      continue
    }

    if (!seen.has(exp.id)) {
      seen.add(exp.id)
      candidates.push({
        suggestion: suggestions[suggestions.length - 1],
        gap: Math.max(0, gap),
        business: businessGap(exp.date, tx.bookingDate),
        exact,
      })
    }
  }

  // Bankarbeitstage entscheiden: Der Beleg, dessen Einzug am besten zum
  // Buchungstag passt, wird zur Primärempfehlung. Toleranz-Treffer bleiben
  // bewusst niedrig — sie sind geschätzt und werden nie automatisch übernommen.
  const distance = (c: Candidate): number => Math.abs(c.business - expected)
  candidates.sort(
    (a, b) => distance(a) - distance(b) || a.gap - b.gap || Number(b.exact) - Number(a.exact),
  )
  for (const candidate of candidates) {
    candidate.suggestion.confidence = candidate.exact ? 'high' : 'low'
  }
  if (candidates.length > 0) {
    const best = candidates[0]
    const tied = candidates.filter((c) => distance(c) === distance(best))
    // Eindeutig der nächste Beleg? Dann als Empfehlung hervorheben (auch bei
    // geschätzten Fremdwährungsbeträgen, die nie automatisch übernommen werden).
    if (tied.length === 1) best.suggestion.recommended = true
  }
  const exactCandidates = candidates.filter((c) => c.exact)
  if (exactCandidates.length > 0) {
    const best = exactCandidates[0]
    const tied = exactCandidates.filter((c) => distance(c) === distance(best))
    const next = exactCandidates.find((c) => distance(c) > distance(best))
    const margin = next ? distance(next) - distance(best) : Number.POSITIVE_INFINITY
    // Nur bei klarem Vorsprung (oder am selben Tag) den Rest zurückstufen.
    // Ein Bankarbeitstag Unterschied ist kein Beweis — dann bleiben beide wählbar.
    if (tied.length === 1 && (exactCandidates.length === 1 || best.gap === 0 || margin >= 2)) {
      for (const candidate of exactCandidates) {
        if (candidate !== best) candidate.suggestion.confidence = 'low'
      }
    }
  }

  // Primär zuerst, dann nach Passgenauigkeit, dann nach Datumsnähe.
  const order = new Map<MatchSuggestion, number>()
  for (const candidate of candidates) order.set(candidate.suggestion, distance(candidate) * 100 + candidate.gap)
  suggestions.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === 'high' ? -1 : 1
    return (order.get(a) ?? 99) - (order.get(b) ?? 99)
  })

  // Always offer to create an expense (low). The UI requires a receipt PDF for
  // this path; the bank transaction is the source of truth for amount + date.
  const vendor = tx.counterparty !== '' ? tx.counterparty : tx.remittance.slice(0, 40)
  suggestions.push({
    txId: tx.id,
    kind: 'debit',
    createExpense: { vendor, gross: d, date: tx.bookingDate },
    confidence: 'low',
    label: `Ausgabe anlegen (Beleg): ${vendor} ${eur(d)}`,
  })

  return suggestions
}
