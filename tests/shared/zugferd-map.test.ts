import { describe, it, expect } from 'vitest'
import type { Invoice, Client, CompanySettings, InvoiceItem } from '../../src/shared/types'
import {
  resolveCountryCode,
  assertExportable,
  mapInvoiceToZugferd,
} from '../../src/shared/zugferd-map'

// --- Builders -------------------------------------------------------------

function makeSettings(over: Partial<CompanySettings> = {}): CompanySettings {
  return {
    name: 'Max Mustermann',
    subtitle: 'Visuelle Kommunikation',
    addressLines: ['Max Mustermann', 'Musterstraße 1', '12345 Musterstadt', 'Germany'],
    phone: '+49 30 1234567',
    email: 'mail@example.com',
    taxNumber: '12/345/67890',
    vatId: 'DE123456789',
    iban: 'DE89 3704 0044 0532 0130 00',
    bic: 'COBADEFFXXX',
    bank: 'Musterbank',
    paymentTermsDays: 14,
    recipientName: 'Max Mustermann',
    sellerStreet: 'Musterstraße 1',
    sellerZip: '12345',
    sellerCity: 'Musterstadt',
    sellerCountryCode: 'DE',
    ...over,
  }
}

function makeClient(over: Partial<Client> = {}): Client {
  return {
    id: 1,
    notionId: null,
    contactPerson: '',
    addressExtra: '',
    name: 'Beispiel Kunde GmbH',
    address: '',
    street: 'Musterstraße 1',
    zip: '10115',
    city: 'Berlin',
    country: 'Deutschland',
    email: 'kunde@example.com',
    hourlyRate: 95,
    noTax: false,
    vatId: null,
    notes: '',
    ...over,
  }
}

function makeItem(over: Partial<InvoiceItem> = {}): InvoiceItem {
  return {
    id: 1,
    invoiceId: 1,
    notionTaskId: null,
    projectId: null,
    position: 0,
    title: 'Designleistung',
    description: '',
    quantity: null,
    unitPrice: null,
    fixPrice: 1000,
    amount: 1000,
    ...over,
  }
}

function makeInvoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 1,
    number: '2026024',
    clientId: 1,
    date: '2026-06-15',
    servicePeriodStart: null,
    servicePeriodEnd: null,
    status: 'finalized',
    subtotal: 1000,
    taxRate: 0.19,
    taxAmount: 190,
    total: 1190,
    noTax: false,
    reverseCharge: false,
    poNumber: null,
    notes: null,
    pdfPath: null,
    hash: null,
    prevHash: null,
    finalizedAt: null,
    paidAt: null,
    items: [makeItem()],
    ...over,
  }
}

// --- resolveCountryCode ---------------------------------------------------

describe('resolveCountryCode', () => {
  it('maps German and English country names + ISO codes to ISO-2', () => {
    expect(resolveCountryCode('Deutschland')).toBe('DE')
    expect(resolveCountryCode('Germany')).toBe('DE')
    expect(resolveCountryCode('DE')).toBe('DE')
    expect(resolveCountryCode('  de ')).toBe('DE')
    expect(resolveCountryCode('Österreich')).toBe('AT')
    expect(resolveCountryCode('Austria')).toBe('AT')
    expect(resolveCountryCode('Niederlande')).toBe('NL')
  })

  it('defaults empty to DE (domestic) and returns null for the unknown', () => {
    expect(resolveCountryCode('')).toBe('DE')
    expect(resolveCountryCode('   ')).toBe('DE')
    expect(resolveCountryCode('Atlantis')).toBeNull()
  })
})

// --- assertExportable -----------------------------------------------------

describe('assertExportable', () => {
  it('accepts a complete standard invoice', () => {
    expect(assertExportable(makeInvoice(), makeClient(), makeSettings())).toEqual([])
  })

  it('flags a missing structured seller address and VAT id', () => {
    const errs = assertExportable(
      makeInvoice(),
      makeClient(),
      makeSettings({ sellerStreet: '', sellerCity: '', vatId: '' }),
    )
    expect(errs.length).toBeGreaterThan(0)
    expect(errs.some((e) => /Verkäufer/i.test(e))).toBe(true)
  })

  it('flags a missing buyer city and an unresolvable buyer country', () => {
    expect(assertExportable(makeInvoice(), makeClient({ city: '' }), makeSettings()).some((e) => /Kunde/i.test(e))).toBe(true)
    expect(assertExportable(makeInvoice(), makeClient({ country: 'Atlantis' }), makeSettings()).some((e) => /Land/i.test(e))).toBe(true)
  })

  it('requires the buyer VAT id for reverse-charge invoices', () => {
    const inv = makeInvoice({ noTax: true, reverseCharge: true, taxRate: 0, taxAmount: 0, total: 1000 })
    expect(assertExportable(inv, makeClient({ vatId: null }), makeSettings()).some((e) => /USt/i.test(e))).toBe(true)
    expect(assertExportable(inv, makeClient({ vatId: 'ATU12345678' }), makeSettings())).toEqual([])
  })
})

// --- mapInvoiceToZugferd: standard 19% ------------------------------------

describe('mapInvoiceToZugferd — standard 19%', () => {
  const data = mapInvoiceToZugferd(makeInvoice(), makeClient({ vatId: 'DE123456789' }), makeSettings())

  it('sets header fields', () => {
    expect(data.number).toBe('2026024')
    expect(data.typeCode).toBe('380')
    expect(data.issueDate.getFullYear()).toBe(2026)
    expect(data.issueDate.getMonth()).toBe(5) // June (0-based)
    expect(data.issueDate.getDate()).toBe(15)
  })

  it('maps a fixed-price line', () => {
    const line = data.transaction.line[0]
    expect(line.tradeProduct.name).toBe('Designleistung')
    expect(line.tradeAgreement.netTradePrice.chargeAmount).toBe('1000.00')
    expect(line.tradeDelivery.billedQuantity).toEqual({ amount: 1, unitMeasureCode: 'C62' })
    expect(line.tradeSettlement.tradeTax).toEqual({ typeCode: 'VAT', categoryCode: 'S', rateApplicablePercent: '19' })
    expect(line.tradeSettlement.monetarySummation.lineTotalAmount).toBe('1000.00')
  })

  it('maps seller and buyer parties', () => {
    const { seller, buyer } = data.transaction.tradeAgreement
    expect(seller.name).toBe('Max Mustermann')
    expect(seller.postalAddress).toEqual({ postCode: '12345', line1: 'Musterstraße 1', city: 'Musterstadt', countryCode: 'DE' })
    expect(seller.taxRegistration?.vatIdentifier).toBe('DE123456789')
    expect(buyer.name).toBe('Beispiel Kunde GmbH')
    expect(buyer.postalAddress).toEqual({ postCode: '10115', line1: 'Musterstraße 1', city: 'Berlin', countryCode: 'DE' })
    expect(buyer.taxRegistration?.vatIdentifier).toBe('DE123456789')
  })

  it('sets payment, VAT breakdown and totals', () => {
    const s = data.transaction.tradeSettlement
    expect(s.currencyCode).toBe('EUR')
    expect(s.paymentInstruction.typeCode).toBe('58')
    expect(s.paymentInstruction.transfers?.[0].paymentAccountIdentifier).toBe('DE89370400440532013000') // spaces stripped
    expect(s.vatBreakdown).toEqual([
      { calculatedAmount: '190.00', typeCode: 'VAT', basisAmount: '1000.00', categoryCode: 'S', rateApplicablePercent: '19' },
    ])
    expect(s.paymentTerms?.dueDate?.getDate()).toBe(29) // 15 + 14
    expect(s.monetarySummation).toEqual({
      lineTotalAmount: '1000.00',
      taxBasisTotalAmount: '1000.00',
      taxTotal: { currencyCode: 'EUR', amount: '190.00' },
      grandTotalAmount: '1190.00',
      duePayableAmount: '1190.00',
    })
  })

  it('uses a delivery date (Leistungsdatum) when no service period is given', () => {
    expect(data.transaction.tradeSettlement.invoicingPeriod).toBeUndefined()
    expect(data.transaction.tradeDelivery.information?.deliveryDate?.getDate()).toBe(15)
  })
})

// --- mapInvoiceToZugferd: hourly line + service period --------------------

describe('mapInvoiceToZugferd — hourly line and service period', () => {
  it('maps quantity/unitPrice to an HUR line', () => {
    const inv = makeInvoice({
      subtotal: 950, taxAmount: 180.5, total: 1130.5,
      items: [makeItem({ fixPrice: null, quantity: 10, unitPrice: 95, amount: 950 })],
    })
    const line = mapInvoiceToZugferd(inv, makeClient(), makeSettings()).transaction.line[0]
    expect(line.tradeAgreement.netTradePrice.chargeAmount).toBe('95.00')
    expect(line.tradeDelivery.billedQuantity).toEqual({ amount: 10, unitMeasureCode: 'HUR' })
    expect(line.tradeSettlement.monetarySummation.lineTotalAmount).toBe('950.00')
  })

  it('sets the invoicing period (BG-14) when a service period is present', () => {
    const inv = makeInvoice({ servicePeriodStart: '2026-05-01', servicePeriodEnd: '2026-05-31' })
    const period = mapInvoiceToZugferd(inv, makeClient(), makeSettings()).transaction.tradeSettlement.invoicingPeriod
    expect(period?.startDate.getDate()).toBe(1)
    expect(period?.endDate.getDate()).toBe(31)
    expect(period?.endDate.getMonth()).toBe(4) // May
  })
})

// --- mapInvoiceToZugferd: reverse charge ----------------------------------

describe('mapInvoiceToZugferd — reverse charge (noTax)', () => {
  const inv = makeInvoice({ noTax: true, reverseCharge: true, taxRate: 0, taxAmount: 0, total: 1000 })
  const data = mapInvoiceToZugferd(inv, makeClient({ vatId: 'ATU12345678', country: 'Österreich' }), makeSettings())

  it('uses VAT category AE at 0% on the line', () => {
    expect(data.transaction.line[0].tradeSettlement.tradeTax).toEqual({
      typeCode: 'VAT', categoryCode: 'AE', rateApplicablePercent: '0',
    })
  })

  it('emits an AE VAT breakdown with an exemption reason', () => {
    expect(data.transaction.tradeSettlement.vatBreakdown).toEqual([
      {
        calculatedAmount: '0.00',
        typeCode: 'VAT',
        basisAmount: '1000.00',
        categoryCode: 'AE',
        rateApplicablePercent: '0',
        exemptionReasonCode: 'VATEX-EU-AE',
        exemptionReasonText: 'Steuerschuldnerschaft des Leistungsempfängers.',
      },
    ])
  })

  it('totals carry no VAT', () => {
    expect(data.transaction.tradeSettlement.monetarySummation).toEqual({
      lineTotalAmount: '1000.00',
      taxBasisTotalAmount: '1000.00',
      taxTotal: { currencyCode: 'EUR', amount: '0.00' },
      grandTotalAmount: '1000.00',
      duePayableAmount: '1000.00',
    })
  })
})

describe('mapInvoiceToZugferd — §19 Kleinunternehmer', () => {
  const inv = makeInvoice({ noTax: true, reverseCharge: false, taxRate: 0, taxAmount: 0, total: 1000 })
  const data = mapInvoiceToZugferd(inv, makeClient({ vatId: null }), makeSettings())

  it('nutzt Kategorie E statt Reverse Charge', () => {
    expect(data.transaction.line[0].tradeSettlement.tradeTax.categoryCode).toBe('E')
    expect(data.transaction.tradeSettlement.vatBreakdown[0].categoryCode).toBe('E')
    expect(data.transaction.tradeSettlement.vatBreakdown[0].exemptionReasonCode).toBe('VATEX-EU-O')
  })

  it('laesst sich ohne USt-IdNr. des Kunden finalisieren', () => {
    expect(assertExportable(inv, makeClient({ vatId: null }), makeSettings())).toEqual([])
  })
})

describe('mapInvoiceToZugferd — Storno', () => {
  const inv = makeInvoice({ correctsNumber: '2026010' })
  const data = mapInvoiceToZugferd(inv, makeClient(), makeSettings())

  it('traegt typeCode 384 und den Bezug auf die Vorrechnung', () => {
    expect(data.typeCode).toBe('384')
    expect(data.invoiceReferencedDocument).toEqual({ issuerAssignedId: '2026010' })
  })
})

describe('mapInvoiceToZugferd — currency and zero rating', () => {
  const inv = makeInvoice({
    currency: 'USD',
    taxMode: 'zero',
    taxRate: 0,
    taxAmount: 0,
    total: 1000,
  })
  const data = mapInvoiceToZugferd(inv, makeClient(), makeSettings())

  it('uses the document currency', () => {
    expect(data.transaction.tradeSettlement.currencyCode).toBe('USD')
    expect(data.transaction.tradeSettlement.monetarySummation.taxTotal.currencyCode).toBe('USD')
  })

  it('uses category Z for a zero-rated invoice', () => {
    expect(data.transaction.line[0].tradeSettlement.tradeTax.categoryCode).toBe('Z')
    expect(data.transaction.tradeSettlement.vatBreakdown[0].categoryCode).toBe('Z')
  })
})
