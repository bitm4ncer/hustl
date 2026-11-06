import { convertToEur, loadFxRates, type FxRates } from './fx'

export type Currency = 'EUR' | 'USD' | 'GBP' | 'CHF'

export interface ParsedExpense {
  vendor: string | null
  date: string | null // 'YYYY-MM-DD'
  amount: number | null // in `currency`; negativ = Gutschrift
  currency: Currency
  /** Umsatzsteuersatz in Prozent, wie er auf dem Beleg steht; null = nicht erkannt. */
  vatRate: number | null
}

export interface ExtractedFields {
  vendor: string | null
  date: string | null
  gross: number | null // converted to EUR
  currency: Currency // original currency detected on the document
  originalAmount: number | null // amount in `currency`; null for EUR receipts
  vatRate: number | null
}

const round2 = (n: number): number => Math.round(n * 100) / 100

// Betragstoken: mit Tausender-Gruppen (Leerzeichen, Punkt, Komma, Apostroph)
// und optionalem Dezimalteil. Das Minus ist Teil des Tokens, damit Gutschriften
// nicht als Ausgabe gebucht werden.
const AMOUNT_RE =
  /-?\d{1,3}(?:[ \u00a0'’]\d{3})+(?:[.,]\d{1,2})?|-?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d{1,2})?/g

const KEYWORDS = [
  'gesamtbetrag',
  'rechnungsbetrag',
  'zu zahlen',
  'zahlbetrag',
  'endbetrag',
  'endsumme',
  'amount due',
  'amount paid',
  'grand total',
  'total amount',
  'gesamt',
  'summe',
  'total',
]

/**
 * Parse a numeric token in either German (1.234,56) or English/dot (1,234.56 / 5.00)
 * format. The decimal separator is the last '.' or ',' that has 1–2 trailing digits;
 * anything else is treated as a thousands separator (or an integer).
 */
export function parseAmount(raw: string): number {
  const s = raw.replace(/[^\d.,]/g, '')
  if (!s) return NaN
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let decPos = Math.max(lastComma, lastDot)
  if (decPos !== -1) {
    const dec = s.slice(decPos + 1)
    if (dec.length < 1 || dec.length > 2) decPos = -1 // not a decimal -> thousands
  }
  if (decPos === -1) return Number(s.replace(/[.,]/g, ''))
  const intPart = s.slice(0, decPos).replace(/[.,]/g, '')
  return Number(`${intPart}.${s.slice(decPos + 1)}`)
}

function detectCurrency(window: string): Currency | null {
  if (/€|\bEUR\b/i.test(window)) return 'EUR'
  if (/\$|\bUSD\b|\bUS\$/i.test(window)) return 'USD'
  if (/£|\bGBP\b/i.test(window)) return 'GBP'
  if (/\bCHF\b|SFr\.?|Fr\./i.test(window)) return 'CHF'
  return null
}

/**
 * Datumsangaben durch gleich lange Leerzeichen ersetzen: Beträge und Datums-
 * teile sehen sich sonst zu ähnlich ("11.04.2026" → 11, 04, 2026). Die Länge
 * bleibt erhalten, damit alle Indizes weiter auf den Originaltext zeigen.
 */
function maskDates(text: string): string {
  return text
    .replace(/\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}/g, (m) => ' '.repeat(m.length))
    .replace(/\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}/g, (m) => ' '.repeat(m.length))
}

interface AmountHit {
  value: number
  index: number
  hasDecimal: boolean
}

function collectAmounts(text: string): AmountHit[] {
  const hits: AmountHit[] = []
  for (const m of text.matchAll(AMOUNT_RE)) {
    const raw = m[0]
    const index = m.index ?? 0
    // "19 %" ist ein Steuersatz, kein Betrag.
    if (text.slice(index + raw.length, index + raw.length + 2).trim().startsWith('%')) continue
    const value = parseAmount(raw)
    if (!Number.isFinite(value) || value === 0) continue
    // Gutschriften tragen das Minus vor dem Betrag; parseAmount bleibt vorzeichenlos,
    // weil der Kontoauszug-Parser dasselbe Werkzeug für Absolutbeträge nutzt.
    const signed = raw.trimStart().startsWith('-') ? -value : value
    hits.push({ value: signed, index, hasDecimal: /[.,]\d{1,2}$/.test(raw) })
  }
  return hits
}

// Ein einzelner Beleg über einer Million ist praktisch immer eine ID/Summe aus
// mehreren Seiten. Bewusst großzügig, damit echte Großbelege nicht durchfallen.
const MAX_PLAUSIBLE = 1_000_000

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findAmount(text: string): { amount: number; index: number } | null {
  const masked = maskDates(text)
  const hits = collectAmounts(masked).filter((h) => Math.abs(h.value) <= MAX_PLAUSIBLE)
  if (hits.length === 0) return null

  // 1) Betrag direkt hinter einem Total-Wort. Wortgrenzen sind Pflicht:
  //    "Subtotal"/"Zwischensumme"/"Gesamtgewicht" dürfen nicht als Total gelten.
  for (const kw of KEYWORDS) {
    const re = new RegExp(`\\b${escapeRe(kw)}\\b`, 'gi')
    const positions = [...masked.matchAll(re)].map((m) => m.index ?? 0)
    for (const pos of positions.reverse()) {
      const near = hits
        .filter((h) => h.index >= pos && h.index - pos < 60)
        .sort((a, b) => a.index - b.index)[0]
      if (near) return { amount: round2(near.value), index: near.index }
    }
  }

  // 2) Ohne Beschriftung: der größte Betrag mit Nachkommastellen.
  const decimal = hits.filter((h) => h.hasDecimal)
  if (decimal.length === 0) return null
  const best = decimal.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a))
  return { amount: round2(best.value), index: best.index }
}

function monthIndexFromName(name: string): number | null {
  const k = name.toLowerCase().slice(0, 3)
  const map: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, 'mär': 3, apr: 4, may: 5, mai: 5, jun: 6, jul: 7,
    aug: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dez: 12,
  }
  return map[k] ?? null
}

interface DateHit {
  iso: string
  index: number
}

/** Echte Datumsprüfung: 45.45.2026 darf nie in die Datenbank wandern. */
function isoFrom(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const dt = new Date(Date.UTC(year, month - 1, day))
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    return null
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function expandYear(y: number): number {
  if (y >= 100) return y
  return y <= 69 ? 2000 + y : 1900 + y
}

// All dates in the text (German, ISO and month-name forms), with their position.
function collectDates(text: string): DateHit[] {
  const out: DateHit[] = []
  const push = (iso: string | null, index: number): void => {
    if (iso) out.push({ iso, index })
  }
  for (const m of text.matchAll(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/g)) {
    push(isoFrom(expandYear(Number(m[3])), Number(m[2]), Number(m[1])), m.index ?? 0)
  }
  for (const m of text.matchAll(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/g)) {
    push(isoFrom(expandYear(Number(m[3])), Number(m[2]), Number(m[1])), m.index ?? 0)
  }
  for (const m of text.matchAll(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g)) {
    push(isoFrom(Number(m[1]), Number(m[2]), Number(m[3])), m.index ?? 0)
  }
  for (const m of text.matchAll(/([A-Za-zäöüÄÖÜ]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/g)) {
    const mi = monthIndexFromName(m[1])
    if (mi) push(isoFrom(Number(m[3]), mi, Number(m[2])), m.index ?? 0)
  }
  for (const m of text.matchAll(/(\d{1,2})\.?\s+([A-Za-zäöüÄÖÜ]{3,9})\.?\s+(\d{4})/g)) {
    const mi = monthIndexFromName(m[2])
    if (mi) push(isoFrom(Number(m[3]), mi, Number(m[1])), m.index ?? 0)
  }
  return out.sort((a, b) => a.index - b.index)
}

// Specific to the invoice/issue date; tried first (nearest date after the label).
const INVOICE_DATE_KW = [
  'rechnungsdatum', 'belegdatum', 'rechnung vom', 'ausstellungsdatum', 'datum der rechnung',
  'invoice date', 'date of issue', 'issued on', 'bill date',
]
// Labels, nach denen ein Datum NICHT das Belegdatum ist.
const NOT_INVOICE_DATE_KW = [
  'fällig', 'faellig', 'zahlbar', 'due', 'paid on', 'payment date', 'bestell', 'liefer',
  'leistungsdatum', 'service period', 'leistungszeitraum', 'gültig bis', 'gueltig bis',
  'abrechnungszeitraum', 'billing period',
]
const DATE_TOKEN = String.raw`(?:\d{1,2}[.\-/]\d{1,2}[.\-/]\d{2,4}|\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})`
// "11.04.2026 - 10.05.2026" / "… bis …" — a date range, i.e. a service period,
// not the invoice date. Used to skip range members in the fallback.
const RANGE_RE = new RegExp(`${DATE_TOKEN}\\s*(?:[-–—]|bis|to)\\s*${DATE_TOKEN}`, 'gi')

function findDate(text: string): string | null {
  const dates = collectDates(text)
  if (dates.length === 0) return null
  const lower = text.toLowerCase()

  // 1) Date right after an explicit invoice-date label.
  for (const kw of INVOICE_DATE_KW) {
    for (let pos = lower.indexOf(kw); pos !== -1; pos = lower.indexOf(kw, pos + 1)) {
      const near = dates.find((d) => d.index >= pos && d.index - pos < 40)
      if (near) return near.iso
    }
  }

  // 2) Otherwise the first standalone date — skip dates that are part of a
  //    "date – date" range or follow a due/delivery label.
  const ranges: Array<[number, number]> = []
  for (const m of text.matchAll(RANGE_RE)) ranges.push([m.index ?? 0, (m.index ?? 0) + m[0].length])
  const inRange = (idx: number): boolean => ranges.some(([s, e]) => idx >= s && idx < e)
  const afterSkipLabel = (idx: number): boolean => {
    const before = lower.slice(Math.max(0, idx - 30), idx)
    return NOT_INVOICE_DATE_KW.some((kw) =>
      new RegExp(`(^|[^a-zäöüß])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(before),
    )
  }
  const usable = dates.filter((d) => !inRange(d.index) && !afterSkipLabel(d.index))
  // Kein Datum ist besser als ein falsches: steht nur ein Fälligkeits- oder
  // Zahlungsdatum im Beleg, bleibt das Feld leer.
  return usable.length > 0 ? usable[0].iso : null
}

const LINE_AMOUNT_RE = /\d+[.,]\d{2}/
const LEGAL_FORM_RE = /\b(gmbh|ag|inc\.?|ltd\.?|llc|e\.k\.|e\.v\.|ug|kg|ohg|gbr|se)\b/i

function findVendor(text: string): string | null {
  const candidates: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.length < 3) continue
    if (/^\d/.test(line)) continue
    if (LINE_AMOUNT_RE.test(line)) continue
    // Wortgrenzen: "DATEV" und "Betragswerk GmbH" sind Firmen, keine Labels.
    if (/^(rechnung|invoice|receipt|datum|date|nr|betrag|seite|page|bill to|supplier|kunde|customer)\b/i.test(line)) continue
    if (!/[a-zA-ZäöüÄÖÜ]/.test(line)) continue
    candidates.push(line.slice(0, 80))
    if (candidates.length >= 12) break
  }
  const fromLines = candidates.find((line) => LEGAL_FORM_RE.test(line)) ?? candidates[0] ?? null
  if (fromLines) return fromLines

  // Viele PDFs liefern den Text ohne Zeilenumbrüche. Dann die Firma am
  // Rechtsform-Wort suchen ("Anthropic, PBC", "OpenAI, LLC") und den Namen
  // davor freischneiden — sonst landet das halbe Dokument im Feld.
  const legal = text.match(LEGAL_FORM_RE)
  if (legal && legal.index !== undefined) {
    const before = text.slice(Math.max(0, legal.index - 45), legal.index)
    const cut = before.split(/[.;]|\s{2,}|\d/).pop() ?? ''
    const name = `${cut}${legal[0]}`.trim().replace(/^[,;:\s]+/, '')
    if (name.length >= 3) return name.slice(0, 80)
  }
  return null
}

/**
 * Umsatzsteuersatz aus dem Beleg. Reihenfolge: explizite Null-Fälle
 * (Reverse Charge, steuerfrei), dann "19 % MwSt"/"MwSt 19 %". Wird nichts
 * gefunden, bleibt es bei null — der Aufrufer entscheidet über den Default.
 */
function findVatRate(text: string): number | null {
  const lower = text.toLowerCase()
  if (/reverse[\s-]*charge|steuerfrei|tax exempt|nicht steuerbar|nettoverfahren/i.test(lower)) {
    return 0
  }
  const patterns = [
    /(\d{1,2})\s*%\s*(?:mwst|ust|vat|umsatzsteuer|steuer)/i,
    /(?:mwst|ust|vat|umsatzsteuer)[^%\n]{0,16}?(\d{1,2})\s*%/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) {
      const rate = Number(m[1])
      if (rate >= 0 && rate <= 30) return rate
    }
  }
  return null
}

export function parseExpenseText(text: string): ParsedExpense {
  if (!text || !text.trim()) {
    return { vendor: null, date: null, amount: null, currency: 'EUR', vatRate: null }
  }
  const found = findAmount(text)
  let currency: Currency = 'EUR'
  if (found) {
    // Direkt am Betrag suchen (±10 Zeichen), sonst im ganzen Dokument.
    const near = text.slice(Math.max(0, found.index - 10), found.index + 12)
    currency = detectCurrency(near) ?? detectCurrency(text) ?? 'EUR'
  } else {
    currency = detectCurrency(text) ?? 'EUR'
  }
  return {
    vendor: findVendor(text),
    date: findDate(text),
    amount: found ? found.amount : null,
    currency,
    vatRate: findVatRate(text),
  }
}

// EUR stays the ledger currency: `gross` is always EUR, the original amount is
// kept alongside so the bank reconcile can match FX card debits exactly.
export function toExtractedFields(parsed: ParsedExpense, fx: FxRates): ExtractedFields {
  const gross =
    parsed.amount == null
      ? null
      : parsed.currency === 'EUR'
        ? parsed.amount
        : convertToEur(parsed.amount, parsed.currency, parsed.date, fx)
  return {
    vendor: parsed.vendor,
    date: parsed.date,
    gross,
    currency: parsed.currency,
    originalAmount: parsed.currency === 'EUR' ? null : parsed.amount,
    vatRate: parsed.vatRate,
  }
}

// Reads the PDF text layer (digital PDFs), parses fields and converts the amount
// to EUR via cached ECB rates. Scans without a text layer -> all null.
export async function extractExpenseFromPdf(filePath: string, rates?: FxRates): Promise<ExtractedFields> {
  const { readFile } = await import('node:fs/promises')
  const buf = await readFile(filePath)
  const { getDocumentProxy, extractText } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(buf))
  const res = await extractText(pdf, { mergePages: true })
  const text = typeof res.text === 'string' ? res.text : (res.text as string[]).join('\n')
  const parsed = parseExpenseText(text)
  const fx = rates ?? (await loadFxRates())
  return toExtractedFields(parsed, fx)
}
