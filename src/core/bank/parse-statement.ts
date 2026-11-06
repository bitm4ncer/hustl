import type { BankTransaction } from '@shared/types'
import { parseAmount } from '../expense/pdf-extract'

export interface ParsedStatementTx {
  valueDate: string // 'YYYY-MM-DD' (Wertstellung)
  bookingDate: string // 'YYYY-MM-DD' (Verbuchungsdatum)
  amount: number // signed: >0 credit, <0 debit
  description: string
  counterparty: string
  remittance: string
  internal: boolean
}

export interface ParsedStatement {
  yearMonth: string // 'YYYY-MM'
  transactions: ParsedStatementTx[]
}

// "Wertstellung TT.MM.JJJJ TT.MM.JJJJ ±N.NNN,NN€" — one booked transaction.
const TX_RE =
  /Wertstellung\s+(\d{2}\.\d{2}\.\d{4})\s+(\d{2}\.\d{2}\.\d{4})\s+([+-][\d.]+,\d{2})\s*€/g

// Category words that terminate the counterparty name in a description.
const CATEGORY_RE = /\b(?:Gutschriften|Lastschriften|Belastungen|Business Mastercard|Mastercard)\b/

// Internal main-account movements (own pots / private draws) — auto-ignored on import.
// Tolerates N26 UI typos: "Steurerrücklage", "Entnahmr".
const INTERNAL_RE =
  /Private Entnahm|Von Sparen|An Sparen|(?:Von|An) Steurer?rücklage|Von Hauptkonto|An Hauptkonto|Einkommensverteiler/i

const PAGE_HEADER = 'Beschreibung Verbuchungsdatum Betrag'

function toIso(de: string): string {
  const [d, m, y] = de.split('.')
  return `${y}-${m}-${d}`
}

function detectYearMonth(text: string): string {
  const m = text.match(/Nr\.\s*(\d{2})\/(\d{4})/)
  if (m) return `${m[2]}-${m[1]}`
  const d = text.match(/(\d{2})\.(\d{2})\.(\d{4})/)
  return d ? `${d[3]}-${d[2]}` : ''
}

function signedAmount(token: string): number {
  const v = parseAmount(token)
  return token.trim().startsWith('-') ? -v : v
}

// Strip page-break boilerplate that leaks into a description. The boilerplate
// (address, "Kontoauszug Nr. …", "Nr. MM/YYYY N / M") always ends with the
// column-header line — keep only what follows the LAST occurrence.
function cleanDescription(raw: string): string {
  let s = raw
  const idx = s.lastIndexOf(PAGE_HEADER)
  if (idx !== -1) s = s.slice(idx + PAGE_HEADER.length)
  return s.replace(/\s+/g, ' ').trim()
}

function extractCounterparty(description: string): string {
  const m = description.match(CATEGORY_RE)
  const head = m && m.index !== undefined ? description.slice(0, m.index) : description.slice(0, 60)
  return head.trim()
}

function isInternal(description: string, counterparty: string, ownNames: string[]): boolean {
  if (INTERNAL_RE.test(description)) return true
  const cp = counterparty.toLowerCase()
  return ownNames.some((n) => n.trim() !== '' && cp.includes(n.toLowerCase()))
}

export function parseStatement(
  text: string,
  opts: { ownNames?: string[] } = {},
): ParsedStatement {
  const yearMonth = detectYearMonth(text)
  // Main-account transactions only: everything before the first account summary.
  // (Space transactions appear in the text BEFORE their "Space Kontoauszug" footer,
  // so the first "Dein alter Kontostand" is the reliable Hauptkonto/Spaces boundary.)
  const cut = text.indexOf('Dein alter Kontostand')
  const main = cut === -1 ? text : text.slice(0, cut)
  const ownNames = opts.ownNames ?? []

  const transactions: ParsedStatementTx[] = []
  let lastEnd = 0
  for (const m of main.matchAll(TX_RE)) {
    const start = m.index ?? 0
    const description = cleanDescription(main.slice(lastEnd, start))
    lastEnd = start + m[0].length
    const counterparty = extractCounterparty(description)
    transactions.push({
      valueDate: toIso(m[1]),
      bookingDate: toIso(m[2]),
      amount: signedAmount(m[3]),
      description,
      counterparty,
      remittance: description,
      internal: isInternal(description, counterparty, ownNames),
    })
  }
  return { yearMonth, transactions }
}

// Deterministic, non-cryptographic 32-bit FNV-1a hash → base36. Stable across
// re-imports of the same statement so upsert is idempotent.
function hashId(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export function mapStatementTx(tx: ParsedStatementTx, accountId: string): BankTransaction {
  return {
    id: `stmt-${hashId(`${tx.bookingDate}|${tx.amount}|${tx.description}`)}`,
    accountId,
    bookingDate: tx.bookingDate,
    amount: tx.amount,
    currency: 'EUR',
    counterparty: tx.counterparty,
    remittance: tx.remittance,
    kind: tx.amount >= 0 ? 'credit' : 'debit',
    status: tx.internal ? 'ignored' : 'unmatched',
    matchedInvoiceId: null,
    matchedExpenseId: null,
    matchedFixedCostId: null,
  }
}
