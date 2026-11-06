import { describe, it, expect } from 'vitest'
import { renderOfferHtml } from '../../../src/core/export/offer-template'
import { DEFAULT_TEMPLATE } from '../../../src/shared/template-defaults'
import { DEFAULT_SETTINGS } from '../../../src/core/db/seed'
import type { Offer } from '../../../src/shared/types'

function baseOffer(over: Partial<Offer> = {}): Offer {
  return {
    id: 1, number: 'ANG-2026-001', kind: 'angebot', clientId: null, clientName: '',
    prospect: { name: 'Acme GmbH', contactPerson: '', addressExtra: '', email: '', street: 'Weg 1', zip: '10115', city: 'Berlin', country: 'Deutschland', vatId: 'DE123456789' },
    title: 'Website', date: '2026-06-15', validUntil: '2026-06-29',
    servicePeriodStart: '2026-07-01', servicePeriodEnd: '2026-08-31',
    status: 'sent', taxMode: 'regular', freibleibend: false,
    discountKind: 'none', discountValue: 0, hourlyRate: 0, showHours: false, introText: '', closingText: '',
    paymentSchedule: { depositPercent: 0, milestones: [] },
    subtotal: 1000, discountAmount: 0, taxRate: 0.19, taxAmount: 190, total: 1190, recurringTotal: 0,
    acceptedAt: null, acceptedBy: null, acceptanceNote: null, version: 1, parentOfferId: null,
    convertedProjectId: null, convertedInvoiceId: null, emailSentAt: null, emailRecipient: null, pdfPath: null,
    items: [{ id: 1, offerId: 1, position: 0, section: '', title: 'Konzept', description: 'Markenkonzept', quantity: null, unit: 'Psch', unitPrice: null, fixPrice: 1000, amount: 1000, optional: false, recurring: false, catalogItemId: null, internalHours: null }],
    ...over,
  }
}

describe('renderOfferHtml', () => {
  it('angebot shows Angebot title, number, validity and 19% tax', () => {
    const html = renderOfferHtml({ offer: baseOffer(), settings: DEFAULT_SETTINGS, template: DEFAULT_TEMPLATE })
    expect(html).toContain('Angebot')
    expect(html).toContain('ANG-2026-001')
    expect(html).toContain('Gültig bis')
    expect(html).toContain('19% MwSt')
    expect(html).toContain('Acme GmbH')
  })

  it('stacks Firmenname, Ansprechpartner and Zusatz above the address', () => {
    const offer = baseOffer({
      prospect: {
        name: 'Acme GmbH', contactPerson: 'Anna Wolter', addressExtra: 'Kostenträger 102070',
        email: '', street: 'Weg 1', zip: '10115', city: 'Berlin', country: 'Deutschland', vatId: '',
      },
    })
    const html = renderOfferHtml({ offer, settings: DEFAULT_SETTINGS, template: DEFAULT_TEMPLATE })
    expect(html).toContain(
      '<strong>Acme GmbH</strong><br>Anna Wolter<br>Kostenträger 102070<br>' +
        'Weg 1<br>10115 Berlin<br>Deutschland',
    )
  })

  it('kostenvoranschlag shows the §650 overrun note and KVA title', () => {
    const html = renderOfferHtml({ offer: baseOffer({ kind: 'kostenvoranschlag' }), settings: DEFAULT_SETTINGS, template: DEFAULT_TEMPLATE })
    expect(html).toContain('Kostenvoranschlag')
    expect(html).toContain('§ 650')
  })

  it('reverse_charge shows the §13b note and 0% tax', () => {
    const html = renderOfferHtml({ offer: baseOffer({ taxMode: 'reverse_charge', taxRate: 0, taxAmount: 0, total: 1000 }), settings: DEFAULT_SETTINGS, template: DEFAULT_TEMPLATE })
    expect(html).toContain('§ 13b')
  })

  it('kleinunternehmer shows the §19 note', () => {
    const html = renderOfferHtml({ offer: baseOffer({ taxMode: 'kleinunternehmer', taxRate: 0, taxAmount: 0, total: 1000 }), settings: DEFAULT_SETTINGS, template: DEFAULT_TEMPLATE })
    expect(html).toContain('§ 19')
  })

  it('renders an English offer with a foreign currency', () => {
    const html = renderOfferHtml({
      offer: baseOffer({ language: 'en', currency: 'USD', taxRate: 0.2, taxAmount: 200, total: 1200 }),
      settings: DEFAULT_SETTINGS,
      template: DEFAULT_TEMPLATE,
    })
    expect(html).toContain('Offer no.')
    expect(html).toContain('Valid until')
    expect(html).toContain('USD')
    expect(html).not.toContain('Angebotsnr.')
  })
})
