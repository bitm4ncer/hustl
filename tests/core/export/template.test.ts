import { describe, it, expect } from 'vitest'
import { renderInvoiceHtml } from '../../../src/core/export/template'
import { DEFAULT_SETTINGS } from '../../../src/core/db/seed'
import { DEFAULT_TEMPLATE } from '../../../src/shared/template-defaults'
import type { Invoice, Client } from '@shared/types'

const client: Client = {
  id: 1,
  notionId: null,
  contactPerson: '',
  addressExtra: '',
  name: 'Acme',
  address: 'Street 1\n12345 City',
  street: '',
  zip: '',
  city: '',
  country: '',
  email: '',
  hourlyRate: 80,
  noTax: false,
  vatId: null,
  notes: ''
}

const invoice: Invoice = {
  id: 1,
  number: '2026025',
  clientId: 1,
  date: '2026-06-14',
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
  items: [
    {
      id: 1,
      invoiceId: 1,
      notionTaskId: null,
      position: 0,
      title: 'Logo',
      description: 'Redesign',
      quantity: 10,
      unitPrice: 80,
      fixPrice: null,
      amount: 800
    }
  ]
}

describe('renderInvoiceHtml', () => {
  it('includes number, client, totals in German format', () => {
    const html = renderInvoiceHtml({ invoice, client, settings: DEFAULT_SETTINGS })
    expect(html).toContain('2026025')
    expect(html).toContain('Acme')
    expect(html).toContain('1.000,00') // subtotal
    expect(html).toContain('190,00') // tax
    expect(html).toContain('1.190,00') // total
    expect(html).toContain('19% MwSt')
    expect(html).toContain('DE123456789')
  })

  it('stacks Firmenname, Ansprechpartner and Zusatz above the address', () => {
    const html = renderInvoiceHtml({
      invoice,
      client: {
        ...client,
        contactPerson: 'Anna Wolter',
        addressExtra: 'Kostenträger 102070',
        address: '',
        street: 'Charlottenstraße 47',
        zip: '10117',
        city: 'Berlin',
        country: 'Deutschland'
      },
      settings: DEFAULT_SETTINGS
    })
    expect(html).toContain(
      '<strong>Acme</strong><br>Anna Wolter<br>Kostenträger 102070<br>' +
        'Charlottenstraße 47<br>10117 Berlin<br>Deutschland'
    )
  })

  it('leaves out empty contact and extra lines', () => {
    const html = renderInvoiceHtml({ invoice, client, settings: DEFAULT_SETTINGS })
    expect(html).toContain('<strong>Acme</strong><br>Street 1<br>12345 City')
  })

  it('renders sub-items with optional hours note and multiline descriptions', () => {
    const html = renderInvoiceHtml({
      invoice: {
        ...invoice,
        items: [
          {
            ...invoice.items[0],
            description: 'Zeile eins\nZeile zwei',
            subItems: [
              { title: 'Setup', description: 'Staging + CMS', hours: 2 },
              { title: '', description: 'Nur Text ohne Titel', hours: null }
            ]
          }
        ]
      },
      client,
      settings: DEFAULT_SETTINGS
    })
    expect(html).toContain('<strong>Setup</strong>')
    expect(html).toContain('Staging + CMS')
    expect(html).toContain('2 Std')
    expect(html).toContain('Nur Text ohne Titel')
    expect(html).toContain('Zeile eins<br>Zeile zwei')
    // Positionen ohne Stunden bekommen keinen Std-Hinweis.
    expect(html.match(/sub-item-hours/g)).toHaveLength(2) // 1× CSS-Regel + 1× Zeile
  })

  it('shows reverse-charge note and 0% for noTax clients', () => {
    const html = renderInvoiceHtml({
      invoice: {
        ...invoice,
        noTax: true,
        reverseCharge: true,
        taxRate: 0,
        taxAmount: 0,
        total: 1000
      },
      client: { ...client, noTax: true },
      settings: DEFAULT_SETTINGS
    })
    expect(html).toContain('0% MwSt')
    expect(html).toContain('nicht steuerbare Leistung')
  })

  it('renders English labels and a foreign currency', () => {
    const html = renderInvoiceHtml({
      invoice: { ...invoice, language: 'en', currency: 'USD', taxMode: 'standard' },
      client,
      settings: DEFAULT_SETTINGS
    })
    expect(html).toContain('Invoice number')
    expect(html).toContain('Total')
    expect(html).toContain('USD')
    expect(html).not.toContain('Rechnungsnummer')
  })
})

describe('renderInvoiceHtml — template config', () => {
  const base = { invoice, client, settings: DEFAULT_SETTINGS }

  it('injects the accent colour', () => {
    const html = renderInvoiceHtml({ ...base, template: { ...DEFAULT_TEMPLATE, accentColor: '#abcdef' } })
    expect(html).toContain('#abcdef')
  })

  it('hides the bank block when showBankDetails is false', () => {
    const on = renderInvoiceHtml({ ...base, template: DEFAULT_TEMPLATE })
    const off = renderInvoiceHtml({ ...base, template: { ...DEFAULT_TEMPLATE, showBankDetails: false } })
    expect(on).toContain('IBAN')
    expect(off).not.toContain('IBAN')
  })

  it('renders custom meta rows and the intro/closing/footer texts', () => {
    const html = renderInvoiceHtml({
      ...base,
      template: {
        ...DEFAULT_TEMPLATE,
        metaRows: [{ label: 'Kundennr.', value: 'K-7' }],
        introText: 'Guten Tag',
        closingText: 'Beste Grüße',
        footerNote: 'Danke!',
      },
    })
    expect(html).toContain('Kundennr.')
    expect(html).toContain('K-7')
    expect(html).toContain('Guten Tag')
    expect(html).toContain('Beste Grüße')
    expect(html).toContain('Danke!')
  })

  it('still renders with no template argument (neutral default)', () => {
    expect(renderInvoiceHtml(base)).toContain('2026025')
  })
})
