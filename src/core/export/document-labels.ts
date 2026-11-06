import type { DocumentLanguage, TaxMode } from '@shared/types'

export function localeFor(language: DocumentLanguage): string {
  return language === 'en' ? 'en-GB' : 'de-DE'
}

export function countryName(code: string, language: DocumentLanguage): string {
  const normalized = (code || '').trim().toUpperCase()
  if (!normalized) return ''
  try {
    return new Intl.DisplayNames([localeFor(language)], { type: 'region' }).of(normalized) ?? normalized
  } catch {
    return normalized
  }
}

export function taxLabel(language: DocumentLanguage, _mode: TaxMode, rate: number): string {
  const pct = Math.round((rate || 0) * 100)
  if (language === 'en') return `${pct}% VAT`
  return `${pct}% MwSt`
}

export function taxNote(language: DocumentLanguage, mode: TaxMode): string {
  if (language === 'en') {
    if (mode === 'reverse_charge') return 'VAT liability rests with the recipient (reverse charge).'
    if (mode === 'small_business') return 'No VAT charged (German small-business rule, § 19 UStG).'
    if (mode === 'exempt') return 'VAT-exempt service.'
    if (mode === 'zero') return '0% VAT.'
    return ''
  }
  if (mode === 'reverse_charge') {
    return 'Es handelt sich um eine in Deutschland nicht steuerbare Leistung (Steuerschuldnerschaft des Leistungsempfängers gemäß § 13b UStG).'
  }
  if (mode === 'small_business') return 'Kein Ausweis von Umsatzsteuer gemäß § 19 UStG.'
  if (mode === 'exempt') return 'Steuerfreie Leistung.'
  if (mode === 'zero') return '0 % Umsatzsteuer.'
  return ''
}

export interface InvoiceLabels {
  title: string
  invoiceNumber: string
  date: string
  servicePeriod: string
  creditNoteFor: string
  subtotal: string
  total: string
  paymentTerms: string
  payableWithin: (days: number) => string
  payee: string
  taxNumber: string
  vatId: string
  bank: string
  hoursShort: string
  page: string
  of: string
}

export function invoiceLabels(language: DocumentLanguage): InvoiceLabels {
  if (language === 'en') {
    return {
      title: 'Invoice',
      invoiceNumber: 'Invoice number',
      date: 'Date',
      servicePeriod: 'Service period',
      creditNoteFor: 'Credit note for invoice no.',
      subtotal: 'Subtotal',
      total: 'Total',
      paymentTerms: 'Payment terms',
      payableWithin: (days) => `Payable within ${days} days without deduction.`,
      payee: 'Payee',
      taxNumber: 'Tax number',
      vatId: 'VAT ID',
      bank: 'Bank',
      hoursShort: 'h',
      page: 'Page',
      of: 'of',
    }
  }
  return {
    title: 'Rechnung',
    invoiceNumber: 'Rechnungsnummer',
    date: 'Datum',
    servicePeriod: 'Leistungszeitraum',
    creditNoteFor: 'Stornorechnung zu Rechnung Nr.',
    subtotal: 'Zwischensumme',
    total: 'Gesamt',
    paymentTerms: 'Zahlungsbedingungen',
    payableWithin: (days) => `Zahlbar innerhalb von ${days} Tagen ohne Abzug.`,
    payee: 'Empfänger',
    taxNumber: 'Steuernummer',
    vatId: 'USt-IdNr.',
    bank: 'Bank',
    hoursShort: 'Std',
    page: 'Seite',
    of: 'von',
  }
}

export interface OfferLabels {
  title: (kind: 'angebot' | 'kostenvoranschlag') => string
  offerNumber: string
  date: string
  validUntil: string
  servicePeriod: string
  subtotal: string
  discount: string
  total: string
  optionalServices: string
  recurringCosts: string
  hourlyRateNote: (rate: string) => string
  acceptance: string
  signature: string
  validUntilNote: (date: string) => string
  subjectToChange: string
  plusVat: string
  costEstimateNote: string
  page: string
  of: string
  hoursShort: string
}

export function offerLabels(language: DocumentLanguage): OfferLabels {
  if (language === 'en') {
    return {
      title: (kind) => (kind === 'kostenvoranschlag' ? 'Cost estimate' : 'Offer'),
      offerNumber: 'Offer no.',
      date: 'Date',
      validUntil: 'Valid until',
      servicePeriod: 'Service period',
      subtotal: 'Subtotal',
      discount: 'Discount',
      total: 'Total',
      optionalServices: 'Optional services',
      recurringCosts: 'Recurring costs',
      hourlyRateNote: (rate) => `All hourly items at ${rate}/h.`,
      acceptance: 'Offer accepted:',
      signature: 'Place, date, signature',
      validUntilNote: (date) => `This offer is valid until ${date}.`,
      subjectToChange: 'Offer subject to change and non-binding.',
      plusVat: 'All prices are plus statutory VAT.',
      costEstimateNote:
        'This cost estimate is non-binding. If the estimated effort is likely to be significantly exceeded, we will notify you immediately pursuant to § 650 (2) BGB.',
      page: 'Page',
      of: 'of',
      hoursShort: 'h',
    }
  }
  return {
    title: (kind) => (kind === 'kostenvoranschlag' ? 'Kostenvoranschlag' : 'Angebot'),
    offerNumber: 'Angebotsnr.',
    date: 'Datum',
    validUntil: 'Gültig bis',
    servicePeriod: 'Leistungszeitraum',
    subtotal: 'Zwischensumme',
    discount: 'Rabatt',
    total: 'Gesamt',
    optionalServices: 'Optionale Leistungen',
    recurringCosts: 'Laufende Kosten',
    hourlyRateNote: (rate) => `Alle Stundenpositionen zum Stundensatz von ${rate} / Std.`,
    acceptance: 'Angebot angenommen:',
    signature: 'Ort, Datum, Unterschrift',
    validUntilNote: (date) => `Dieses Angebot ist gültig bis zum ${date}.`,
    subjectToChange: 'Angebot freibleibend und unverbindlich.',
    plusVat: 'Alle Preise verstehen sich zzgl. der gesetzlichen Umsatzsteuer.',
    costEstimateNote:
      'Dieser Kostenvoranschlag ist unverbindlich. Sollte sich eine wesentliche Überschreitung des veranschlagten Aufwands abzeichnen, wird dies gemäß § 650 Abs. 2 BGB unverzüglich angezeigt.',
    page: 'Seite',
    of: 'von',
    hoursShort: 'Std',
  }
}
