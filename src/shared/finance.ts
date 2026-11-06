import type { FixedCost, Invoice, Expense, FinanceBasis, FinanceSummary, MonthlyPoint } from './types'
import type { MonthRange } from './period'
import { monthIndex, monthFromIndex, monthOf, monthsBetween, inRange } from './period'
import { round2 } from './money'

export function netOfGross(gross: number, ratePct: number): number {
  return round2(gross / (1 + ratePct / 100))
}

export function vatOfGross(gross: number, ratePct: number): number {
  return round2(gross - gross / (1 + ratePct / 100))
}

export function fixedCostMonths(fc: FixedCost, from: string, to: string): string[] {
  if (!fc.active) return []
  // Retroactive: a fixed cost (Miete, KSK …) is assumed to apply across the whole
  // viewed range, also BEFORE its startDate — startDate only anchors the cadence
  // (for quarterly/yearly). endDate still stops it. So we don't clip the lower
  // bound to startDate.
  const startM = monthOf(fc.startDate)
  const endM = fc.endDate ? monthOf(fc.endDate) : to
  const lo = monthIndex(from)
  const hi = Math.min(monthIndex(to), monthIndex(endM))
  const step = fc.interval === 'monthly' ? 1 : fc.interval === 'quarterly' ? 3 : 12
  const startIdx = monthIndex(startM)
  const out: string[] = []
  for (let i = lo; i <= hi; i++) {
    if ((i - startIdx) % step === 0) out.push(monthFromIndex(i))
  }
  return out
}

export function expandFixedCosts(
  fixedCosts: FixedCost[],
  from: string,
  to: string,
): Map<string, { net: number; vat: number }> {
  const out = new Map<string, { net: number; vat: number }>()
  for (const fc of fixedCosts) {
    const net = netOfGross(fc.gross, fc.vatRate)
    const vat = vatOfGross(fc.gross, fc.vatRate)
    for (const m of fixedCostMonths(fc, from, to)) {
      const prev = out.get(m) ?? { net: 0, vat: 0 }
      out.set(m, { net: round2(prev.net + net), vat: round2(prev.vat + vat) })
    }
  }
  return out
}

export function summarize(
  input: { invoices: Invoice[]; expenses: Expense[]; fixedCosts: FixedCost[] },
  range: MonthRange,
  basis: FinanceBasis,
  anchorMonth: string,
): FinanceSummary {
  const { invoices, expenses, fixedCosts } = input

  // Rechnungen können in Fremdwährung ausgestellt sein; die Auswertung bleibt
  // in EUR (Leitwährung). Der Kurs wird beim Beleg gespeichert, nicht live
  // nachgezogen.
  const inEur = (amount: number, inv: Invoice): number =>
    round2(amount * (inv.exchangeRate > 0 ? inv.exchangeRate : 1))

  const revRows: Array<{ month: string; net: number; vat: number }> = []
  for (const i of invoices) {
    if (basis === 'cash') {
      if (i.status !== 'paid' || !i.paidAt) continue
      const month = monthOf(i.paidAt)
      if (!inRange(month, range)) continue
      revRows.push({ month, net: inEur(i.subtotal, i), vat: inEur(i.taxAmount, i) })
    } else {
      if (i.status === 'draft' || i.status === 'cancelled') continue
      const month = monthOf(i.date)
      if (!inRange(month, range)) continue
      revRows.push({ month, net: inEur(i.subtotal, i), vat: inEur(i.taxAmount, i) })
    }
  }

  const expRows: Array<{ month: string; net: number; vat: number }> = []
  for (const e of expenses) {
    const ref = basis === 'cash' ? e.paidAt : e.date
    if (!ref) continue
    const month = monthOf(ref)
    if (!inRange(month, range)) continue
    expRows.push({ month, net: netOfGross(e.gross, e.vatRate), vat: vatOfGross(e.gross, e.vatRate) })
  }

  // Effektives Fenster bestimmen (für die Monatsreihe + Fixkosten-Expansion).
  let from = range.from
  let to = range.to
  if (range.from === '0000-01') {
    const dataMonths = [...revRows, ...expRows].map((r) => r.month)
    const fcStarts = fixedCosts.filter((f) => f.active).map((f) => monthOf(f.startDate))
    const lows = [...dataMonths, ...fcStarts, anchorMonth]
    const highs = [...dataMonths, anchorMonth]
    from = lows.reduce((a, b) => (a < b ? a : b))
    to = highs.reduce((a, b) => (a > b ? a : b))
  }

  const months = monthsBetween(from, to)
  const bucket = new Map<string, MonthlyPoint>()
  for (const m of months) bucket.set(m, { month: m, revenue: 0, expenses: 0, fixedCosts: 0, profit: 0 })

  let vatCollected = 0
  let vatPaid = 0
  for (const r of revRows) {
    const b = bucket.get(r.month)
    if (b) b.revenue = round2(b.revenue + r.net)
    vatCollected += r.vat
  }
  for (const r of expRows) {
    const b = bucket.get(r.month)
    if (b) b.expenses = round2(b.expenses + r.net)
    vatPaid += r.vat
  }
  for (const [m, v] of expandFixedCosts(fixedCosts, from, to)) {
    const b = bucket.get(m)
    if (b) b.fixedCosts = round2(b.fixedCosts + v.net)
    vatPaid += v.vat
  }

  const monthly = months.map((m) => bucket.get(m)!)
  for (const b of monthly) b.profit = round2(b.revenue - b.expenses - b.fixedCosts)

  const revenue = round2(monthly.reduce((s, b) => s + b.revenue, 0))
  const expensesTotal = round2(monthly.reduce((s, b) => s + b.expenses, 0))
  const fixedCostsTotal = round2(monthly.reduce((s, b) => s + b.fixedCosts, 0))

  // "Offen" ist eine globale Momentaufnahme aller finalisierten, unbezahlten
  // Rechnungen — bewusst NICHT auf `range` eingeschränkt (offene Forderungen).
  // BRUTTO (i.total), denn das ist der Betrag, den der Kunde tatsächlich schuldet
  // (passt zur Offene-Rechnungen-Liste, die ebenfalls brutto zeigt).
  let openRevenue = 0
  let openCount = 0
  for (const i of invoices) {
    if (i.status === 'finalized' || i.status === 'sent') {
      openRevenue += inEur(i.total, i)
      openCount += 1
    }
  }

  return {
    revenue,
    expenses: expensesTotal,
    fixedCosts: fixedCostsTotal,
    profit: round2(revenue - expensesTotal - fixedCostsTotal),
    vatCollected: round2(vatCollected),
    vatPaid: round2(vatPaid),
    vatBalance: round2(vatCollected - vatPaid),
    openRevenue: round2(openRevenue),
    openCount,
    monthly,
  }
}
