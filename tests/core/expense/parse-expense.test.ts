import { describe, it, expect } from 'vitest'
import { parseAmount, parseExpenseText, toExtractedFields } from '../../../src/core/expense/pdf-extract'
import type { FxRates } from '../../../src/core/expense/fx'

describe('parseAmount', () => {
  it('parses German and English/dot formats', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56)
    expect(parseAmount('1,234.56')).toBe(1234.56)
    expect(parseAmount('71,39')).toBe(71.39)
    expect(parseAmount('5.00')).toBe(5)
    expect(parseAmount('9.99')).toBe(9.99)
    expect(parseAmount('1.234')).toBe(1234) // single dot, 3 trailing -> thousands
    expect(parseAmount('1,234')).toBe(1234)
  })
})

describe('parseExpenseText', () => {
  it('German EUR invoice (comma decimals + keyword)', () => {
    const t = ['Adobe Systems', 'Rechnungsdatum: 05.06.2026', 'Zwischensumme 60,00', 'Gesamtbetrag 71,39'].join('\n')
    const r = parseExpenseText(t)
    expect(r.amount).toBe(71.39)
    expect(r.currency).toBe('EUR')
    expect(r.date).toBe('2026-06-05')
  })

  it('EUR with dot decimals (€5.00)', () => {
    const r = parseExpenseText('Invoice\nSubtotal €5.00\nTotal €5.00\nDate of issue January 7, 2026')
    expect(r.amount).toBe(5)
    expect(r.currency).toBe('EUR')
    expect(r.date).toBe('2026-01-07')
  })

  it('USD invoice ($10.00 USD)', () => {
    const r = parseExpenseText('Midjourney Inc\nTotal $10.00 Amount due $10.00 USD')
    expect(r.amount).toBe(10)
    expect(r.currency).toBe('USD')
  })

  it('prefers the invoice date over an earlier service period (Mobilfunk case)', () => {
    const t = [
      'Telekom Mobilfunk',
      'Leistungszeitraum: 11.04.2026 - 10.05.2026',
      'Rechnungsdatum: 14.05.2026',
      'Gesamtbetrag 68,98',
    ].join('\n')
    const r = parseExpenseText(t)
    expect(r.date).toBe('2026-05-14')
  })

  it('skips a leading service-period date when there is no explicit invoice-date label', () => {
    const t = ['Vodafone', 'Leistungszeitraum 11.04.2026 - 10.05.2026', '15.05.2026', 'Summe 52,98'].join('\n')
    const r = parseExpenseText(t)
    expect(r.date).toBe('2026-05-15')
  })

  it('real Vodafone Mobilfunk layout: picks "Rechnung vom", not the period start', () => {
    const t = 'Hallo Max Mustermann, hier ist Ihre Vodafone-Mobilfunkrechnung für den Zeitraum vom 22.04.2026 bis 21.05.2026 Ihr Rechnungsbetrag ist: 68,98 € Zusammenfassung Ihre Rechnung vom 28.05.2026 für den Rechnungszeitraum vom 22.04.2026 - 21.05.2026 ist fällig am 08.06.2026 Ihren Rechnungsbetrag buchen wir am 08.06.2026'
    const r = parseExpenseText(t)
    expect(r.date).toBe('2026-05-28')
  })

  it('returns nulls / EUR default for empty text', () => {
    expect(parseExpenseText('')).toEqual({ vendor: null, date: null, amount: null, currency: 'EUR', vatRate: null })
  })
})

describe('parseExpenseText — Regressionen aus dem Audit', () => {
  it('nimmt Total, nicht Subtotal', () => {
    const r = parseExpenseText('Subtotal $60.00\nTax $11.39\nTotal $71.39')
    expect(r.amount).toBe(71.39)
  })

  it('nimmt Total, nicht Zwischensumme', () => {
    const r = parseExpenseText('Zwischensumme 60,00\n19% MwSt 11,40\nEndsumme 71,40')
    expect(r.amount).toBe(71.4)
  })

  it('Betrag stimmt auch mit Datumsangaben davor (Indizes bleiben stabil)', () => {
    const r = parseExpenseText('Rechnung vom 14.05.2026\nLeistung 11.04.2026 - 10.05.2026\nGesamtbetrag 117,81')
    expect(r.amount).toBe(117.81)
  })

  it('Tausendertrenner mit Leerzeichen und Apostroph', () => {
    expect(parseExpenseText('Gesamtbetrag 1 234,56').amount).toBe(1234.56)
    expect(parseExpenseText("Total CHF 1'250.00").amount).toBe(1250)
  })

  it('Ganzzahlbetrag hinter dem Total-Wort', () => {
    expect(parseExpenseText('Gesamtbetrag 1.250').amount).toBe(1250)
  })

  it('Gutschrift bleibt negativ', () => {
    expect(parseExpenseText('Gesamtbetrag -71,39').amount).toBe(-71.39)
  })

  it('liest den MwSt-Satz aus dem Beleg', () => {
    expect(parseExpenseText('Gesamtbetrag 12,99\nMwSt 7 % 0,85').vatRate).toBe(7)
    expect(parseExpenseText('Gesamtbetrag 119,00\n19 % USt 19,00').vatRate).toBe(19)
    expect(parseExpenseText('Reverse Charge\nGesamtbetrag 100,00').vatRate).toBe(0)
    expect(parseExpenseText('Gesamtbetrag 10,00').vatRate).toBeNull()
  })

  it('verwirft unmoegliche Daten statt sie zu speichern', () => {
    expect(parseExpenseText('Rechnungsdatum 45.45.2026\nGesamt 10,00').date).toBeNull()
  })

  it('versteht zweistellige Jahre und Slash-Formate', () => {
    expect(parseExpenseText('Rechnungsdatum: 14.05.26\nGesamt 10,00').date).toBe('2026-05-14')
    expect(parseExpenseText('Invoice date 05/06/2026\nTotal 10,00').date).toBe('2026-06-05')
  })

  it('nimmt nicht das Faelligkeitsdatum als Belegdatum', () => {
    const r = parseExpenseText('Rechnungsdatum 01.06.2026\nFaellig am 15.06.2026\nGesamt 10,00')
    expect(r.date).toBe('2026-06-01')
  })
})

describe('toExtractedFields', () => {
  const fx: FxRates = { dates: ['2026-06-09'], rates: { '2026-06-09': { USD: 1.16 } } }

  it('carries the original FX amount through and converts gross to EUR', () => {
    const f = toExtractedFields({ vendor: 'Fal', date: '2026-06-09', amount: 10, currency: 'USD', vatRate: null }, fx)
    expect(f.originalAmount).toBe(10)
    expect(f.currency).toBe('USD')
    expect(f.gross).toBeCloseTo(8.62, 2) // 10 / 1.16
  })

  it('EUR receipts have no original amount', () => {
    const f = toExtractedFields({ vendor: 'X', date: '2026-06-09', amount: 5, currency: 'EUR', vatRate: null }, fx)
    expect(f.originalAmount).toBeNull()
    expect(f.gross).toBe(5)
  })

  it('missing amount stays null everywhere', () => {
    const f = toExtractedFields({ vendor: null, date: null, amount: null, currency: 'USD', vatRate: null }, fx)
    expect(f.gross).toBeNull()
    expect(f.originalAmount).toBeNull()
  })
})
