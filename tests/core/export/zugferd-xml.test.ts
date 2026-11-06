import { describe, it, expect } from 'vitest'
import type { Invoice, Client, CompanySettings } from '../../../src/shared/types'
import { mapInvoiceToZugferd } from '../../../src/shared/zugferd-map'

// Integration check: the mapped data must satisfy node-zugferd's EN16931 Zod
// schema and serialise to CII XML. This guards against drift between our
// hand-written ZugferdInvoiceData shape and the library's real schema.
// strict:false skips the optional Java XSD validator; Zod still runs.

const settings: CompanySettings = {
  name: 'Max Mustermann', subtitle: 'Visuelle Kommunikation',
  addressLines: [], phone: '', email: 'mail@example.de',
  taxNumber: '12/345/67890', vatId: 'DE123456789',
  iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX', bank: 'N26',
  paymentTermsDays: 14, recipientName: 'Max Mustermann',
  sellerStreet: 'Musterstraße 1', sellerZip: '12345', sellerCity: 'Musterstadt', sellerCountryCode: 'DE',
}

const client: Client = {
  id: 1, notionId: null, name: 'Beispiel Kunde GmbH', contactPerson: '', addressExtra: '', address: '',
  street: 'Musterstraße 1', zip: '10115', city: 'Berlin', country: 'Deutschland',
  email: '', hourlyRate: 95, noTax: false, vatId: 'DE123456789', notes: '',
}

function invoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 1, number: '2026024', clientId: 1, date: '2026-06-15',
    servicePeriodStart: '2026-05-01', servicePeriodEnd: '2026-05-31',
    status: 'finalized', subtotal: 1950, taxRate: 0.19, taxAmount: 370.5, total: 2320.5,
    noTax: false, reverseCharge: false, poNumber: null, notes: 'Vielen Dank für die Zusammenarbeit.',
    pdfPath: null, hash: null, prevHash: null, finalizedAt: null, paidAt: null,
    items: [
      { id: 1, invoiceId: 1, notionTaskId: null, projectId: null, position: 0, title: 'Konzept', description: 'Markenkonzept', quantity: null, unitPrice: null, fixPrice: 1000, amount: 1000 },
      { id: 2, invoiceId: 1, notionTaskId: null, projectId: null, position: 1, title: 'Umsetzung', description: '', quantity: 10, unitPrice: 95, fixPrice: null, amount: 950 },
    ],
    ...over,
  }
}

async function toXml(inv: Invoice, cl: Client): Promise<string> {
  const { zugferd } = await import('node-zugferd')
  const { EN16931 } = await import('node-zugferd/profile/en16931')
  const invoicer = zugferd({ profile: EN16931, strict: false })
  return invoicer.create(mapInvoiceToZugferd(inv, cl, settings) as never).toXML()
}

describe('node-zugferd EN16931 — schema acceptance', () => {
  it('produces CII XML for a standard 19% invoice with a service period', async () => {
    const xml = await toXml(invoice(), client)
    expect(xml).toContain('CrossIndustryInvoice')
    expect(xml).toContain('2026024')
    expect(xml).toContain('DE123456789') // seller VAT
    expect(xml).toContain('DE123456789') // buyer VAT
    expect(xml).toContain('2320.50') // grand total
    expect(xml).toContain('DE89370400440532013000') // IBAN, spaces stripped
    expect(xml).toContain('20260501') // service period start (format 102)
    expect(xml).toContain('20260629') // due date = issue + 14d
  })

  it('produces CII XML for a reverse-charge invoice (category AE)', async () => {
    const inv = invoice({
      noTax: true, reverseCharge: true, taxRate: 0, taxAmount: 0, total: 1950,
      servicePeriodStart: null, servicePeriodEnd: null,
    })
    const xml = await toXml(inv, { ...client, vatId: 'ATU12345678', country: 'Österreich' })
    expect(xml).toContain('CrossIndustryInvoice')
    expect(xml).toContain('VATEX-EU-AE')
    expect(xml).toMatch(/<ram:CategoryCode>AE<\/ram:CategoryCode>/)
  })

  it('produces CII XML in a foreign document currency', async () => {
    const inv = invoice({
      currency: 'USD', taxMode: 'standard', taxRate: 0.2,
      taxAmount: 390, total: 2340,
    })
    const xml = await toXml(inv, client)
    expect(xml).toContain('CrossIndustryInvoice')
    expect(xml).toContain('<ram:InvoiceCurrencyCode>USD</ram:InvoiceCurrencyCode>')
  })
})
