import { describe, it, expect } from 'vitest'
import { parseStatement, mapStatementTx } from '../../../src/core/bank/parse-statement'

// Real N26 statement text (unpdf extraction of statement-2026-05.pdf), pages 1–4.
// Main account = pages 1–2 (13 transactions), page 3 = main summary, page 4 = first Space.
const FIXTURE = `Max Mustermann Musterstraße 1, 12345 Musterstadt IBAN: DE89370400440532013000 • BIC: COBADEFFXXX Erstellt am 10.06.2026 Nr. 05/2026 1 / 8 Beschreibung Verbuchungsdatum Betrag N26 NUMBER26 Empfehlung N26 Cashback Wertstellung 01.05.2026 01.05.2026 +0,01€ MOONSHOT AI Business Mastercard • Medien & Telekom Wertstellung 05.05.2026 05.05.2026 -34,67€ Künstlersozialkasse bei der Deutsche Rentenversicherung Knappschaft-Ba Lastschriften IBAN: DE00000000000000000001 • BIC: PBNKDEFFXXX 04-26 13260492B021 Wertstellung 05.05.2026 05.05.2026 -550,53€ Beispiel GmbH Gutschriften IBAN: DE00000000000000000002 • BIC: COBADEFF RE2026020 Wertstellung 08.05.2026 08.05.2026 +593,81€ An Steurerrücklage 20% wurden vom Einkommensverteiler überwiesen Wertstellung 08.05.2026 08.05.2026 -118,76€ Max Mustermann Belastungen IBAN: DE00000000000000000003 • BIC: DUSSDEDDXXX Private Entnahmr Wertstellung 14.05.2026 14.05.2026 -300,00€ Von Sparen Wertstellung 19.05.2026 19.05.2026 +1.500,00€ Kontoauszug Nr. 05/2026 01.05.2026 bis 31.05.2026 Max Mustermann Musterstraße 1, 12345 Musterstadt IBAN: DE89370400440532013000 • BIC: COBADEFFXXX Erstellt am 10.06.2026 Nr. 05/2026 2 / 8 Beschreibung Verbuchungsdatum Betrag Max Mustermann Belastungen IBAN: DE00000000000000000003 • BIC: DUSSDEDDXXX Private Entnahme Wertstellung 19.05.2026 19.05.2026 -1.500,00€ pCloud Business Mastercard • Medien & Telekom Wertstellung 25.05.2026 25.05.2026 -9,99€ Von Sparen Wertstellung 28.05.2026 28.05.2026 +1.000,00€ Erika Beispiel Belastungen IBAN: DE00000000000000000004 • BIC: GENODED1VRR 2026152 Wertstellung 28.05.2026 28.05.2026 -142,80€ An Steurerrücklage UST Apr Wertstellung 28.05.2026 28.05.2026 -697,00€ Max Mustermann Belastungen IBAN: DE00000000000000000003 • BIC: DUSSDEDDXXX Private Entnahme Wertstellung 28.05.2026 28.05.2026 -400,00€ Kontoauszug Nr. 05/2026 01.05.2026 bis 31.05.2026 Max Mustermann Musterstraße 1, 12345 Musterstadt IBAN: DE89370400440532013000 • BIC: COBADEFFXXX Erstellt am 10.06.2026 Nr. 05/2026 3 / 8 Beschreibung Dein alter Kontostand +683,68€ Ausgehende Transaktionen -3.753,75€ Einkommende Transaktionen +3.093,82€ Dein neuer Kontostand +23,75€ Zusammenfassung Nr. 05/2026 01.05.2026 bis 31.05.2026 Max Mustermann Musterstraße 1, 12345 Musterstadt IBAN: DE89370400440532013000 • BIC: COBADEFFXXX Erstellt am 10.06.2026 Nr. 05/2026 4 / 8 Beschreibung Verbuchungsdatum Betrag Von Hauptkonto 20% wurden vom Einkommensverteiler überwiesen Wertstellung 08.05.2026 08.05.2026 +118,76€ Von Hauptkonto UST Apr Wertstellung 28.05.2026 28.05.2026 +697,00€ Space Kontoauszug Nr. 05/2026 Space: Steurerrücklage Datum geöffnet: 03.12.2018 01.05.2026 bis 31.05.2026`

const OWN = { ownNames: ['Max Mustermann'] }

describe('parseStatement', () => {
  it('detects the statement month', () => {
    expect(parseStatement(FIXTURE, OWN).yearMonth).toBe('2026-05')
  })

  it('parses exactly the 13 main-account transactions, excluding Spaces', () => {
    const { transactions } = parseStatement(FIXTURE, OWN)
    expect(transactions).toHaveLength(13)
    // The two page-4 "Von Hauptkonto" Space credits must NOT appear.
    expect(transactions.some((t) => t.amount === 118.76)).toBe(false)
    expect(transactions.some((t) => t.amount === 697.0)).toBe(false)
  })

  it('reads signed amounts and both dates', () => {
    const txs = parseStatement(FIXTURE, OWN).transactions
    expect(txs[0]).toMatchObject({ amount: 0.01, bookingDate: '2026-05-01', valueDate: '2026-05-01' })
    expect(txs[2].amount).toBe(-550.53)
    expect(txs[6].amount).toBe(1500.0)
  })

  it('extracts counterparty and keeps the reference in remittance', () => {
    const credit = parseStatement(FIXTURE, OWN).transactions.find((t) => t.amount === 593.81)!
    expect(credit.counterparty).toBe("Beispiel GmbH")
    expect(credit.remittance).toContain('RE2026020')
  })

  it('flags internal transfers (6 real, 7 internal)', () => {
    const txs = parseStatement(FIXTURE, OWN).transactions
    expect(txs.filter((t) => !t.internal)).toHaveLength(6)
    expect(txs.filter((t) => t.internal)).toHaveLength(7)
    // "Private Entnahme", "Von Sparen", "An Steurerrücklage" → internal
    expect(txs.find((t) => t.amount === -300.0)!.internal).toBe(true)
    expect(txs.find((t) => t.amount === 1500.0)!.internal).toBe(true)
    // A real expense is not internal
    expect(txs.find((t) => t.amount === -9.99)!.internal).toBe(false)
  })
})

describe('mapStatementTx', () => {
  it('maps to a BankTransaction with deterministic id and ignored status for internal', () => {
    const tx = parseStatement(FIXTURE, OWN).transactions.find((t) => t.amount === -300.0)!
    const a = mapStatementTx(tx, 'n26-statement')
    const b = mapStatementTx(tx, 'n26-statement')
    expect(a.id).toBe(b.id) // deterministic → idempotent re-import
    expect(a.accountId).toBe('n26-statement')
    expect(a.status).toBe('ignored') // internal
    expect(a.kind).toBe('debit')
  })

  it('maps a real credit to unmatched', () => {
    const tx = parseStatement(FIXTURE, OWN).transactions.find((t) => t.amount === 593.81)!
    const m = mapStatementTx(tx, 'n26-statement')
    expect(m.status).toBe('unmatched')
    expect(m.kind).toBe('credit')
    expect(m.matchedInvoiceId).toBeNull()
  })
})
