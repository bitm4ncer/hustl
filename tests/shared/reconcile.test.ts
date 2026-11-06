import { describe, it, expect } from 'vitest'
import { suggestMatches, parseOriginalAmount, uniqueHighSuggestion, businessGap } from '../../src/shared/reconcile'
import type { BankTransaction, Invoice, Expense, FixedCost } from '../../src/shared/types'

describe('businessGap', () => {
  it('zählt nur Werktage zwischen Beleg und Buchung', () => {
    expect(businessGap('2026-10-22', '2026-10-26')).toBe(2) // Do -> Mo (Fr, Mo)
    expect(businessGap('2026-10-23', '2026-10-27')).toBe(2) // Fr -> Di (Mo, Di)
    expect(businessGap('2026-10-28', '2026-10-30')).toBe(2) // Mi -> Fr (Do, Fr)
    expect(businessGap('2026-10-28', '2026-11-02')).toBe(3) // Mi -> Mo (Do, Fr, Mo)
    expect(businessGap('2026-10-30', '2026-10-30')).toBe(0)
  })
})

function makeTx(overrides: Partial<BankTransaction> = {}): BankTransaction {
  return {    id: 'tx-1',
    accountId: 'acc-1',
    bookingDate: '2026-06-04',
    amount: 2000,
    currency: 'EUR',
    counterparty: 'LAgentur GmbH',
    remittance: 'Rechnung 2026023',
    kind: 'credit',
    status: 'unmatched',
    matchedInvoiceId: null,
    matchedExpenseId: null,
    ...overrides,
  }
}

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 1,
    number: '2026023',
    clientId: 1,
    date: '2026-06-01',
    servicePeriodStart: null,
    servicePeriodEnd: null,
    status: 'sent',
    subtotal: 1680.67,
    taxRate: 19,
    taxAmount: 319.33,
    total: 2000,
    noTax: false,
    reverseCharge: false,
    poNumber: null,
    notes: null,
    pdfPath: null,
    hash: null,
    prevHash: null,
    finalizedAt: '2026-06-01T00:00:00Z',
    paidAt: null,
    items: [],
    ...overrides,
  }
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 1,
    vendor: 'Adobe Systems',
    category: 'Software',
    date: '2026-06-02',
    paidAt: null,
    gross: 9.99,
    originalAmount: null,
    originalCurrency: 'EUR',
    vatRate: 19,
    note: '',
    pdfPath: null,
    sourceName: null,
    ...overrides,
  }
}

function makeFixedCost(overrides: Partial<FixedCost> = {}): FixedCost {
  return {
    id: 1,
    name: 'KSK',
    category: 'Versicherung',
    gross: 550.53,
    vatRate: 0,
    interval: 'monthly',
    startDate: '2026-01-01',
    endDate: null,
    active: true,
    note: '',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Credit → Invoice matching
// ---------------------------------------------------------------------------

describe('suggestMatches — credit', () => {
  it('high confidence when amount matches and remittance contains invoice number', () => {
    const tx = makeTx({ amount: 2000, remittance: 'Rechnung 2026023' })
    const invoice = makeInvoice({ id: 5, number: '2026023', total: 2000, status: 'sent' })
    const suggestions = suggestMatches(tx, [invoice], [])
    expect(suggestions.length).toBeGreaterThan(0)
    const top = suggestions[0]
    expect(top.invoiceId).toBe(5)
    expect(top.confidence).toBe('high')
    expect(top.kind).toBe('credit')
  })

  it('low confidence when amount matches but no reference match', () => {
    const tx = makeTx({ amount: 2000, remittance: 'Zahlung' })
    const invoice = makeInvoice({ id: 3, number: '2026099', total: 2000, status: 'finalized' })
    const suggestions = suggestMatches(tx, [invoice], [])
    expect(suggestions.length).toBeGreaterThan(0)
    // Amount-only match (no invoice number in the remittance) is never a safe match.
    expect(suggestions[0].invoiceId).toBe(3)
    expect(suggestions[0].confidence).toBe('low')
  })

  it('high confidence on invoice-number match even when the amount differs (partial payment)', () => {
    // L'Agentur case: remittance "RE2026020", paid 593,81 against a larger invoice total.
    const tx = makeTx({ amount: 593.81, remittance: 'Gutschriften IBAN: DE84 RE2026020', counterparty: "L'Agentur" })
    const invoice = makeInvoice({ id: 7, number: '2026020', total: 2000, status: 'sent' })
    const suggestions = suggestMatches(tx, [invoice], [])
    expect(suggestions[0].invoiceId).toBe(7)
    expect(suggestions[0].confidence).toBe('high')
  })

  it('matches the invoice number across prefixes (RG / Nr / spaces)', () => {
    const invoice = makeInvoice({ id: 9, number: '2026024', total: 100, status: 'sent' })
    for (const remittance of ['RG2026024', 'Nr2026024', 'Rechnung Nr. 2026024', 'RE-2026024']) {
      const tx = makeTx({ amount: 42, remittance })
      const suggestions = suggestMatches(tx, [invoice], [])
      expect(suggestions.some((s) => s.invoiceId === 9 && s.confidence === 'high')).toBe(true)
    }
  })

  it('low confidence when multiple amount matches and no ref match', () => {
    const tx = makeTx({ amount: 2000, remittance: 'Zahlung ohne Referenz' })
    const inv1 = makeInvoice({ id: 1, number: '2026001', total: 2000, status: 'sent' })
    const inv2 = makeInvoice({ id: 2, number: '2026002', total: 2000, status: 'finalized' })
    const suggestions = suggestMatches(tx, [inv1, inv2], [])
    expect(suggestions.length).toBeGreaterThanOrEqual(2)
    // Multiple amount matches, no ref → all low
    expect(suggestions.every((s) => s.confidence === 'low')).toBe(true)
  })

  it('high confidence with ref match overrides multiple amount matches', () => {
    const tx = makeTx({ amount: 2000, remittance: 'Rechnung 2026001' })
    const inv1 = makeInvoice({ id: 1, number: '2026001', total: 2000, status: 'sent' })
    const inv2 = makeInvoice({ id: 2, number: '2026002', total: 2000, status: 'finalized' })
    const suggestions = suggestMatches(tx, [inv1, inv2], [])
    const high = suggestions.filter((s) => s.confidence === 'high')
    expect(high.length).toBe(1)
    expect(high[0].invoiceId).toBe(1)
  })

  it('matches a paid invoice by reference (link an already-paid invoice to its payment)', () => {
    // Real case: every invoice in the user DB is already 'paid'; the bank credit
    // names the invoice number in the remittance and the amount may differ.
    const tx = makeTx({ amount: 593.81, remittance: 'COBADEFF RE2026020', counterparty: "L'Agentur" })
    const invoice = makeInvoice({ id: 22, number: '2026020', total: 499, status: 'paid' })
    const suggestions = suggestMatches(tx, [invoice], [])
    expect(suggestions[0].invoiceId).toBe(22)
    expect(suggestions[0].confidence).toBe('high')
  })

  it('does NOT amount-match a paid invoice without a reference (avoids noise from the paid pile)', () => {
    const tx = makeTx({ amount: 499, remittance: 'Zahlung ohne Nummer' })
    const invoice = makeInvoice({ id: 22, number: '2026020', total: 499, status: 'paid' })
    const suggestions = suggestMatches(tx, [invoice], [])
    expect(suggestions.filter((s) => s.invoiceId !== undefined)).toHaveLength(0)
  })

  it('does not match a cancelled invoice even by reference', () => {
    const tx = makeTx({ amount: 100, remittance: 'RE2026020' })
    const invoice = makeInvoice({ id: 1, number: '2026020', total: 100, status: 'cancelled' })
    const suggestions = suggestMatches(tx, [invoice], [])
    expect(suggestions.filter((s) => s.invoiceId !== undefined)).toHaveLength(0)
  })

  it('returns empty when no candidates', () => {
    const tx = makeTx({ amount: 999 })
    const suggestions = suggestMatches(tx, [], [])
    expect(suggestions).toHaveLength(0)
  })

  it('high-confidence suggestions appear before low-confidence', () => {
    const tx = makeTx({ amount: 2000, remittance: 'Rechnung 2026001' })
    const inv1 = makeInvoice({ id: 1, number: '2026001', total: 2000, status: 'sent' })
    const inv2 = makeInvoice({ id: 2, number: '2026999', total: 2000, status: 'finalized' })
    const suggestions = suggestMatches(tx, [inv1, inv2], [])
    expect(suggestions[0].confidence).toBe('high')
  })
})

// ---------------------------------------------------------------------------
// Debit → Expense matching
// ---------------------------------------------------------------------------

describe('suggestMatches — debit', () => {
  it('high confidence when expense gross matches debit amount and date within 10 days', () => {
    const tx = makeTx({ id: 'tx-d', amount: -9.99, kind: 'debit', bookingDate: '2026-06-04' })
    const expense = makeExpense({ id: 10, gross: 9.99, date: '2026-06-02' })
    const suggestions = suggestMatches(tx, [], [expense])
    const high = suggestions.filter((s) => s.confidence === 'high' && s.expenseId !== undefined)
    expect(high.length).toBe(1)
    expect(high[0].expenseId).toBe(10)
    expect(high[0].kind).toBe('debit')
  })

  it('no expense match when date is more than 10 days away', () => {
    const tx = makeTx({ id: 'tx-d', amount: -9.99, kind: 'debit', bookingDate: '2026-06-20' })
    const expense = makeExpense({ id: 10, gross: 9.99, date: '2026-06-02' })
    const suggestions = suggestMatches(tx, [], [expense])
    const withExpenseId = suggestions.filter((s) => s.expenseId !== undefined)
    expect(withExpenseId).toHaveLength(0)
  })

  it('high confidence when a debit matches an active fixed cost amount (e.g. KSK)', () => {
    const tx = makeTx({ id: 'tx-ksk', amount: -550.53, kind: 'debit', counterparty: 'Künstlersozialkasse' })
    const ksk = makeFixedCost({ id: 4, name: 'KSK', gross: 550.53, active: true })
    const suggestions = suggestMatches(tx, [], [], [ksk])
    const fc = suggestions.find((s) => s.fixedCostId === 4)
    expect(fc).toBeDefined()
    expect(fc!.confidence).toBe('high')
    expect(fc!.kind).toBe('debit')
    // A fixed-cost match must NOT also create an expense for the same money;
    // the createExpense fallback still exists but the fixed-cost option ranks first.
    expect(suggestions[0].fixedCostId).toBe(4)
  })

  it('ignores inactive fixed costs', () => {
    const tx = makeTx({ id: 'tx-ksk', amount: -550.53, kind: 'debit' })
    const ksk = makeFixedCost({ id: 4, gross: 550.53, active: false })
    const suggestions = suggestMatches(tx, [], [], [ksk])
    expect(suggestions.some((s) => s.fixedCostId !== undefined)).toBe(false)
  })

  it('always includes a createExpense suggestion for debit with no match', () => {
    const tx = makeTx({
      id: 'tx-d',
      amount: -9.99,
      kind: 'debit',
      bookingDate: '2026-06-04',
      counterparty: 'Adobe',
    })
    const suggestions = suggestMatches(tx, [], [])
    const create = suggestions.filter((s) => s.createExpense !== undefined)
    expect(create.length).toBe(1)
    expect(create[0].createExpense!.vendor).toBe('Adobe')
    expect(create[0].createExpense!.gross).toBe(9.99)
    expect(create[0].createExpense!.date).toBe('2026-06-04')
    expect(create[0].confidence).toBe('low')
  })

  it('includes createExpense even when an expense match exists', () => {
    const tx = makeTx({ id: 'tx-d', amount: -9.99, kind: 'debit', bookingDate: '2026-06-04', counterparty: 'Adobe' })
    const expense = makeExpense({ id: 10, gross: 9.99, date: '2026-06-04' })
    const suggestions = suggestMatches(tx, [], [expense])
    const create = suggestions.filter((s) => s.createExpense !== undefined)
    expect(create.length).toBe(1)
  })

  it('uses remittance as vendor fallback when counterparty is empty', () => {
    const tx = makeTx({
      id: 'tx-d', amount: -9.99, kind: 'debit', bookingDate: '2026-06-04',
      counterparty: '', remittance: 'Adobe Creative Cloud Abo',
    })
    const suggestions = suggestMatches(tx, [], [])
    const create = suggestions.find((s) => s.createExpense !== undefined)
    expect(create!.createExpense!.vendor).toBe('Adobe Creative Cloud Abo')
  })

  it('truncates remittance vendor to 40 chars', () => {
    const longRemittance = 'A'.repeat(50)
    const tx = makeTx({
      id: 'tx-d', amount: -9.99, kind: 'debit', bookingDate: '2026-06-04',
      counterparty: '', remittance: longRemittance,
    })
    const suggestions = suggestMatches(tx, [], [])
    const create = suggestions.find((s) => s.createExpense !== undefined)
    expect(create!.createExpense!.vendor.length).toBeLessThanOrEqual(40)
  })

  it('label for createExpense suggestion is human-readable German', () => {
    const tx = makeTx({
      id: 'tx-d', amount: -9.99, kind: 'debit', bookingDate: '2026-06-04', counterparty: 'Adobe',
    })
    const suggestions = suggestMatches(tx, [], [])
    const create = suggestions.find((s) => s.createExpense !== undefined)
    expect(create!.label).toContain('Adobe')
  })
})

// ---------------------------------------------------------------------------
// Label checks for credit
// ---------------------------------------------------------------------------

describe('suggestMatches — labels', () => {
  it('credit suggestion label includes invoice number and counterparty', () => {
    const tx = makeTx({ amount: 2000, remittance: 'Rechnung 2026023', counterparty: 'LAgentur' })
    const invoice = makeInvoice({ id: 1, number: '2026023', total: 2000, status: 'sent' })
    const suggestions = suggestMatches(tx, [invoice], [])
    expect(suggestions[0].label).toContain('2026023')
  })
})

// ---------------------------------------------------------------------------
// FX: Ursprungsbetrag + Toleranz
// ---------------------------------------------------------------------------

describe('parseOriginalAmount', () => {
  it('parses the N26 Ursprungsbetrag line', () => {
    const r = parseOriginalAmount('MIDJOURNEY INC. Business Mastercard Medien & Telekom Ursprungsbetrag 10.00 USD Wechselkurs 0.86800')
    expect(r).toEqual({ amount: 10, currency: 'USD' })
  })

  it('parses comma-decimal amounts', () => {
    expect(parseOriginalAmount('Ursprungsbetrag 1.234,56 GBP')).toEqual({ amount: 1234.56, currency: 'GBP' })
  })

  it('returns null when there is no Ursprungsbetrag', () => {
    expect(parseOriginalAmount('FAL FEATURES LABELS Business Mastercard Medien & Telekom')).toBeNull()
  })
})

describe('suggestMatches - debit FX', () => {
  const fxRemittance = 'MIDJOURNEY INC. Business Mastercard Ursprungsbetrag 10.00 USD Wechselkurs 0.86800'

  it('high confidence when original amount + currency match the Ursprungsbetrag', () => {
    const tx = makeTx({ id: 'tx-fx', amount: -8.68, kind: 'debit', bookingDate: '2026-06-11', remittance: fxRemittance })
    const expense = makeExpense({ id: 20, gross: 8.62, date: '2026-06-09', originalAmount: 10, originalCurrency: 'USD' })
    const suggestions = suggestMatches(tx, [], [expense])
    const hit = suggestions.find((s) => s.expenseId === 20)
    expect(hit).toBeDefined()
    expect(hit!.confidence).toBe('high')
  })

  it('no match when the original currency differs', () => {
    const tx = makeTx({ id: 'tx-fx', amount: -8.68, kind: 'debit', bookingDate: '2026-06-11', remittance: fxRemittance })
    const expense = makeExpense({ id: 20, gross: 8.62, date: '2026-06-09', originalAmount: 10, originalCurrency: 'GBP' })
    const suggestions = suggestMatches(tx, [], [expense])
    expect(suggestions.some((s) => s.expenseId === 20)).toBe(false)
  })

  it('no match when the booking is more than 10 days after the receipt', () => {
    const tx = makeTx({ id: 'tx-fx', amount: -8.68, kind: 'debit', bookingDate: '2026-06-25', remittance: fxRemittance })
    const expense = makeExpense({ id: 20, gross: 8.62, date: '2026-06-09', originalAmount: 10, originalCurrency: 'USD' })
    const suggestions = suggestMatches(tx, [], [expense])
    expect(suggestions.some((s) => s.expenseId === 20)).toBe(false)
  })

  it('low-confidence tolerance match (4 %) when the statement has no Ursprungsbetrag', () => {
    const tx = makeTx({ id: 'tx-fx', amount: -8.68, kind: 'debit', bookingDate: '2026-06-11', remittance: 'FAL FEATURES LABELS Business Mastercard' })
    const expense = makeExpense({ id: 21, gross: 8.62, date: '2026-06-09', originalAmount: 10, originalCurrency: 'USD' })
    const suggestions = suggestMatches(tx, [], [expense])
    const hit = suggestions.find((s) => s.expenseId === 21)
    expect(hit).toBeDefined()
    expect(hit!.confidence).toBe('low')
  })

  it('no tolerance match beyond 4 %', () => {
    const tx = makeTx({ id: 'tx-fx', amount: -8.68, kind: 'debit', bookingDate: '2026-06-11', remittance: 'FAL FEATURES LABELS' })
    const expense = makeExpense({ id: 21, gross: 8.3, date: '2026-06-09', originalAmount: 10, originalCurrency: 'USD' })
    const suggestions = suggestMatches(tx, [], [expense])
    expect(suggestions.some((s) => s.expenseId === 21)).toBe(false)
  })

  it('real Fal case: merchant-side conversion, gross estimate 2.8 % off the booked amount', () => {
    // Fal bills USD but its PSP charges the card in EUR — no Ursprungsbetrag on
    // the statement, and the PSP rate deviates further from ECB than a card rate.
    const tx = makeTx({ id: 'tx-fal', amount: -9.01, kind: 'debit', bookingDate: '2026-06-12', remittance: 'FAL FEATURES LABELS Business Mastercard' })
    const expense = makeExpense({ id: 24, gross: 9.26, date: '2026-06-11', originalAmount: 10, originalCurrency: 'USD' })
    const suggestions = suggestMatches(tx, [], [expense])
    const hit = suggestions.find((s) => s.expenseId === 24)
    expect(hit).toBeDefined()
    expect(hit!.confidence).toBe('low')
  })

  it('EUR expenses never match via the FX tolerance path', () => {
    const tx = makeTx({ id: 'tx-fx', amount: -8.68, kind: 'debit', bookingDate: '2026-06-11', remittance: 'FAL FEATURES LABELS' })
    const expense = makeExpense({ id: 22, gross: 8.62, date: '2026-06-09', originalAmount: null, originalCurrency: 'EUR' })
    const suggestions = suggestMatches(tx, [], [expense])
    expect(suggestions.some((s) => s.expenseId === 22)).toBe(false)
  })

  it('does not duplicate a suggestion when the EUR exact path already matched', () => {
    const tx = makeTx({ id: 'tx-fx', amount: -8.68, kind: 'debit', bookingDate: '2026-06-11', remittance: fxRemittance })
    const expense = makeExpense({ id: 23, gross: 8.68, date: '2026-06-09', originalAmount: 10, originalCurrency: 'USD' })
    const suggestions = suggestMatches(tx, [], [expense])
    expect(suggestions.filter((s) => s.expenseId === 23)).toHaveLength(1)
  })
})

describe('suggestMatches — PayPal-Lastschrift mit gleichen Dollar-Beträgen', () => {
  // Echte Datenlage: acht DeepSeek-Belege, mehrere mit 21,20 USD (~19,63 €).
  // PayPal bucht einige Tage später ab, ohne den Originalbetrag zu nennen.
  const deepseek = [
    makeExpense({ id: 235, vendor: 'Deepseek 1', date: '2026-10-08', gross: 9.81, originalAmount: 10.6, originalCurrency: 'USD' }),
    makeExpense({ id: 236, vendor: 'Deepseek 2', date: '2026-10-13', gross: 19.63, originalAmount: 21.2, originalCurrency: 'USD' }),
    makeExpense({ id: 237, vendor: 'Deepseek 3', date: '2026-10-13', gross: 19.63, originalAmount: 21.2, originalCurrency: 'USD' }),
    makeExpense({ id: 238, vendor: 'Deepseek 4', date: '2026-10-22', gross: 19.63, originalAmount: 21.2, originalCurrency: 'USD' }),
    makeExpense({ id: 239, vendor: 'Deepseek 5', date: '2026-10-23', gross: 49.07, originalAmount: 53, originalCurrency: 'USD' }),
    makeExpense({ id: 240, vendor: 'Deepseek 6', date: '2026-10-28', gross: 19.63, originalAmount: 21.2, originalCurrency: 'USD' }),
    makeExpense({ id: 241, vendor: 'Deepseek 7', date: '2026-10-29', gross: 19.63, originalAmount: 21.2, originalCurrency: 'USD' }),
    makeExpense({ id: 242, vendor: 'Deepseek 8', date: '2026-10-30', gross: 19.63, originalAmount: 21.2, originalCurrency: 'USD' }),
  ]
  const paypal = (bookingDate: string, amount: number): BankTransaction =>
    makeTx({
      id: `pp-${bookingDate}`,
      kind: 'debit',
      bookingDate,
      amount,
      counterparty: 'PayPal Europe S.a.r.l. et Cie S.C.A',
      remittance: 'PayPal Europe S.a.r.l. et Cie S.C.A Lastschriften IBAN: LU89751000135104200E',
    })

  it('Buchung am 26.10. ignoriert Belege, die nach der Buchung liegen', () => {
    const suggestions = suggestMatches(paypal('2026-10-26', -19.7), [], deepseek)
    const ids = suggestions.filter((s) => s.expenseId !== undefined).map((s) => s.expenseId)
    // 6/7/8 liegen nach der Buchung — eine Lastschrift kann nicht vor dem Kauf erfolgen.
    expect(ids).not.toContain(240)
    expect(ids).not.toContain(241)
    expect(ids).not.toContain(242)
    expect(ids[0]).toBe(238) // Deepseek 4, 22.10. — zeitlich am nächsten
  })

  it('Buchung am 30.10. empfiehlt den Beleg von Mittwoch (zwei Bankarbeitstage)', () => {
    const suggestions = suggestMatches(paypal('2026-10-30', -19.86), [], deepseek)
    const ids = suggestions.filter((s) => s.expenseId !== undefined).map((s) => s.expenseId)
    // Lastschriften werden ~2 Bankarbeitstage nach dem Kauf eingezogen:
    // 28.10. (Mi) -> 30.10. (Fr). Der Beleg vom Buchungstag selbst wäre eine
    // Sofortzahlung, nicht diese Lastschrift.
    expect(ids[0]).toBe(240) // Deepseek 6, 28.10.
    expect(ids).toContain(242) // Deepseek 8 bleibt wählbar
    expect(suggestions.find((s) => s.expenseId === 240)!.recommended).toBe(true)
  })

  it('ordnet die November-Lastschriften den Belegen vom 29./30.10. zu', () => {
    const nov2 = suggestMatches(paypal('2026-11-02', -19.7), [], deepseek)
    expect(nov2.filter((s) => s.expenseId !== undefined)[0].expenseId).toBe(241) // Do -> Mo
    const nov3 = suggestMatches(paypal('2026-11-03', -19.86), [], deepseek)
    expect(nov3.filter((s) => s.expenseId !== undefined)[0].expenseId).toBe(242) // Fr -> Di
  })

  it('Buchung am 27.10. findet den 49-USD-Beleg', () => {
    const suggestions = suggestMatches(paypal('2026-10-27', -49.35), [], deepseek)
    expect(suggestions[0].expenseId).toBe(239)
  })

  it('zeigt das Belegdatum in der Beschriftung', () => {
    const suggestions = suggestMatches(paypal('2026-10-30', -19.86), [], deepseek)
    expect(suggestions[0].label).toContain('28.10.')
    expect(suggestions.find((s) => s.expenseId === 242)!.label).toContain('30.10.')
  })

  it('schlägt bereits zugeordnete Belege nicht erneut vor', () => {
    const suggestions = suggestMatches(paypal('2026-10-26', -19.7), [], deepseek, [], {
      matchedExpenseIds: new Set([238, 236, 237]),
    })
    expect(suggestions.filter((s) => s.expenseId !== undefined)).toHaveLength(0)
  })
})

describe('uniqueHighSuggestion', () => {
  const fxRem = 'MIDJOURNEY INC. Business Mastercard Ursprungsbetrag 10.00 USD Wechselkurs 0.86800'

  it('returns the single high suggestion', () => {
    const tx = makeTx({ id: 'tx-fx', amount: -8.68, kind: 'debit', bookingDate: '2026-06-11', remittance: fxRem })
    const mj = makeExpense({ id: 30, vendor: 'Midjourney', gross: 9.26, date: '2026-06-10', originalAmount: 10, originalCurrency: 'USD' })
    const s = uniqueHighSuggestion(suggestMatches(tx, [], [mj]))
    expect(s?.expenseId).toBe(30)
  })

  it('das Datum entscheidet bei gleichem Betrag: Beleg vom Buchungstag gewinnt', () => {
    // Zwei 10-USD-Belege, gleiche Summe. Die Buchung am 11. gehört zum Beleg
    // vom 11.; der vom 10. bleibt als Alternative wählbar, ist aber nicht mehr
    // die Primärempfehlung.
    const tx = makeTx({ id: 'tx-fx', amount: -8.68, kind: 'debit', bookingDate: '2026-06-11', remittance: fxRem })
    const sameDay = makeExpense({ id: 41, vendor: 'Fal AI', gross: 9.26, date: '2026-06-11', originalAmount: 10, originalCurrency: 'USD' })
    const dayBefore = makeExpense({ id: 42, vendor: 'Midjourney', gross: 9.26, date: '2026-06-10', originalAmount: 10, originalCurrency: 'USD' })
    const suggestions = suggestMatches(tx, [], [sameDay, dayBefore])
    expect(suggestions[0].expenseId).toBe(41)
    expect(suggestions[0].confidence).toBe('high')
    expect(suggestions.find((s) => s.expenseId === 42)!.confidence).toBe('low')
    expect(uniqueHighSuggestion(suggestions)?.expenseId).toBe(41)
  })

  it('bleibt mehrdeutig, wenn beide Belege am selben Tag liegen', () => {
    const tx = makeTx({ id: 'tx-fx', amount: -8.68, kind: 'debit', bookingDate: '2026-06-11', remittance: fxRem })
    const a = makeExpense({ id: 43, gross: 9.26, date: '2026-06-11', originalAmount: 10, originalCurrency: 'USD' })
    const b = makeExpense({ id: 44, gross: 9.26, date: '2026-06-11', originalAmount: 10, originalCurrency: 'USD' })
    expect(uniqueHighSuggestion(suggestMatches(tx, [], [a, b]))).toBeNull()
  })

  it('ignores low-confidence suggestions when checking uniqueness', () => {
    const tx = makeTx({ id: 'tx-d', amount: -9.99, kind: 'debit', bookingDate: '2026-06-04', counterparty: 'Adobe' })
    const exp = makeExpense({ id: 33, gross: 9.99, date: '2026-06-02' })
    const s = uniqueHighSuggestion(suggestMatches(tx, [], [exp]))
    expect(s?.expenseId).toBe(33) // createExpense fallback is low and must not block
  })

  it('returns null when there is no high suggestion', () => {
    const tx = makeTx({ id: 'tx-d', amount: -9.99, kind: 'debit', bookingDate: '2026-06-04' })
    expect(uniqueHighSuggestion(suggestMatches(tx, [], []))).toBeNull()
  })
})

