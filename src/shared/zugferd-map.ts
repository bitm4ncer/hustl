import type { Invoice, Client, CompanySettings } from './types'
import { roundMoney, currencyDecimals } from './money'
import { taxCategoryCode, invoiceTaxMode } from './tax'

/**
 * Maps a Hustl invoice to the data shape consumed by `node-zugferd`'s EN16931
 * (Comfort) profile. Pure and framework-free so it can be unit-tested and so the
 * renderer never pulls in the main-process `node-zugferd` dependency.
 *
 * The interface below mirrors the subset of the EN16931 profile we populate.
 * The exporter passes the result to `invoicer.create(data)`, whose Zod schema
 * validates the full structure at runtime (see zugferd-exporter.ts).
 */

interface ZugferdParty {
  name: string
  postalAddress: {
    postCode: string
    line1: string
    line2?: string
    city: string
    countryCode: string
  }
  taxRegistration?: { vatIdentifier: string }
}

interface ZugferdLine {
  identifier: string
  tradeProduct: { name: string; description?: string }
  tradeAgreement: {
    netTradePrice: { chargeAmount: string; basisQuantity: { amount: number; unitMeasureCode: string } }
  }
  tradeDelivery: { billedQuantity: { amount: number; unitMeasureCode: string } }
  tradeSettlement: {
    tradeTax: { typeCode: 'VAT'; categoryCode: string; rateApplicablePercent: string }
    monetarySummation: { lineTotalAmount: string }
  }
}

interface ZugferdVatBreakdown {
  calculatedAmount: string
  typeCode: 'VAT'
  basisAmount: string
  categoryCode: string
  rateApplicablePercent: string
  exemptionReasonText?: string
  exemptionReasonCode?: string
}

export interface ZugferdInvoiceData {
  number: string
  /** 380 = Rechnung, 384 = Storno-/Korrekturrechnung. */
  typeCode: '380' | '384'
  issueDate: Date
  /** BT-25: Bezug auf die stornierte Rechnung. */
  invoiceReferencedDocument?: { issuerAssignedId: string }
  includedNote?: Array<{ content: string }>
  transaction: {
    line: ZugferdLine[]
    tradeAgreement: { seller: ZugferdParty; buyer: ZugferdParty }
    tradeDelivery: { information?: { deliveryDate: Date } }
    tradeSettlement: {
      currencyCode: string
      paymentInstruction: {
        typeCode: string
        transfers?: Array<{ accountName?: string; paymentAccountIdentifier: string }>
      }
      invoicingPeriod?: { startDate: Date; endDate: Date }
      vatBreakdown: ZugferdVatBreakdown[]
      paymentTerms?: { dueDate?: Date }
      monetarySummation: {
        lineTotalAmount: string
        taxBasisTotalAmount: string
        taxTotal: { currencyCode: string; amount: string }
        grandTotalAmount: string
        duePayableAmount: string
      }
    }
  }
}

/** Reverse-charge VAT exemption reason (BT-120/BT-121). */
const REVERSE_CHARGE_CODE = 'VATEX-EU-AE'

/**
 * Common German/English country names → ISO 3166-1 alpha-2. Empty input falls
 * back to 'DE' (a German freelancer's invoices are domestic by default);
 * an unrecognised non-empty value returns null so callers can surface an error.
 */
const COUNTRY_BY_NAME: Record<string, string> = {
  deutschland: 'DE', germany: 'DE',
  österreich: 'AT', oesterreich: 'AT', austria: 'AT',
  schweiz: 'CH', switzerland: 'CH',
  niederlande: 'NL', netherlands: 'NL',
  belgien: 'BE', belgium: 'BE',
  frankreich: 'FR', france: 'FR',
  italien: 'IT', italy: 'IT',
  spanien: 'ES', spain: 'ES',
  polen: 'PL', poland: 'PL',
  luxemburg: 'LU', luxembourg: 'LU',
  dänemark: 'DK', daenemark: 'DK', denmark: 'DK',
  'vereinigtes königreich': 'GB', 'united kingdom': 'GB', 'großbritannien': 'GB',
  'vereinigte staaten': 'US', usa: 'US', 'united states': 'US',
}

export function resolveCountryCode(country: string): string | null {
  const raw = (country ?? '').trim()
  if (raw === '') return 'DE'
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase()
  return COUNTRY_BY_NAME[raw.toLowerCase()] ?? null
}

/** Parse an ISO 'YYYY-MM-DD' as a *local* calendar date (node-zugferd reads
 *  local date components when serialising, so UTC midnight could roll the day
 *  back in positive timezones). */
function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function addDaysLocal(iso: string, days: number): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d + days)
}

const money = (n: number, currency = 'EUR'): string =>
  roundMoney(n, currency).toFixed(currencyDecimals(currency))

const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE',
])

/** Buyer/seller country: explicit ISO code wins, then the free-text name. */
function partyCountry(countryCode: string | null | undefined, country: string): string | null {
  const explicit = (countryCode || '').trim()
  return explicit ? resolveCountryCode(explicit) : resolveCountryCode(country)
}

/**
 * Human-readable preconditions for a compliant e-invoice. Returns German error
 * messages (empty array ⇒ exportable). Run *before* assigning an invoice number
 * so invalid data never burns a gapless number.
 */
export function assertExportable(
  invoice: Invoice,
  client: Client,
  settings: CompanySettings,
): string[] {
  const errors: string[] = []
  const sellerCountry = resolveCountryCode(settings.sellerCountryCode)

  if (!settings.sellerStreet?.trim() || !settings.sellerZip?.trim() || !settings.sellerCity?.trim()) {
    errors.push('Verkäufer-Adresse unvollständig (Straße, PLZ, Ort in den Einstellungen).')
  }
  if (sellerCountry === null) {
    errors.push('Verkäufer-Land unbekannt (ISO-Ländercode in den Einstellungen, z. B. DE).')
  }
  if (!settings.vatId?.trim() && sellerCountry && EU_COUNTRIES.has(sellerCountry)) {
    errors.push('Verkäufer-USt-IdNr. fehlt (in den Einstellungen hinterlegen).')
  }

  if (!client.city?.trim() || !(client.street?.trim() || client.address?.trim())) {
    errors.push('Kunde: Adresse unvollständig (Straße und Ort nötig).')
  }
  if (partyCountry(client.countryCode, client.country) === null) {
    errors.push(`Kunde: Land „${client.country}" unbekannt — bitte korrigieren (z. B. Deutschland).`)
  }
  if (invoiceTaxMode(invoice) === 'reverse_charge' && !client.vatId?.trim()) {
    errors.push('Reverse-Charge: USt-IdNr. des Kunden ist Pflicht.')
  }

  return errors
}

function mapParty(
  name: string,
  street: string,
  zip: string,
  city: string,
  countryCode: string,
  vatId: string | null,
): ZugferdParty {
  const party: ZugferdParty = {
    name,
    postalAddress: { postCode: zip, line1: street, city, countryCode },
  }
  if (vatId?.trim()) party.taxRegistration = { vatIdentifier: vatId.trim() }
  return party
}

function mapLine(
  item: Invoice['items'][number],
  index: number,
  categoryCode: string,
  rate: string,
  currency: string,
): ZugferdLine {
  // Mirror itemAmount(): a fixed price is a single unit; otherwise quantity × unit price (hours).
  const isFixed = item.fixPrice !== null && item.fixPrice !== undefined
  const quantity = isFixed ? 1 : item.quantity ?? 1
  const unitMeasureCode = isFixed || item.quantity === null ? 'C62' : 'HUR'
  const unitPrice = isFixed ? (item.fixPrice as number) : item.unitPrice ?? 0

  return {
    identifier: String(index + 1),
    tradeProduct: {
      name: item.title || 'Leistung',
      ...(item.description ? { description: item.description } : {}),
    },
    tradeAgreement: {
      netTradePrice: {
        chargeAmount: money(unitPrice, currency),
        basisQuantity: { amount: 1, unitMeasureCode },
      },
    },
    tradeDelivery: { billedQuantity: { amount: quantity, unitMeasureCode } },
    tradeSettlement: {
      tradeTax: { typeCode: 'VAT', categoryCode, rateApplicablePercent: rate },
      monetarySummation: { lineTotalAmount: money(item.amount, currency) },
    },
  }
}

export function mapInvoiceToZugferd(
  invoice: Invoice,
  client: Client,
  settings: CompanySettings,
): ZugferdInvoiceData {
  // §19 (kein Steuerausweis) und Reverse Charge sind zwei verschiedene Dinge:
  // §19 → Kategorie E + Befreiungsgrund, Reverse Charge → AE.
  const taxMode = invoiceTaxMode(invoice)
  const categoryCode = taxCategoryCode(taxMode)
  const ratePercent = String(Math.round((invoice.taxRate || 0) * 100))
  const currency = invoice.currency || 'EUR'
  const reverseText =
    invoice.language === 'en'
      ? 'VAT liability rests with the recipient (reverse charge).'
      : 'Steuerschuldnerschaft des Leistungsempfängers.'
  const smallBusinessText =
    invoice.language === 'en'
      ? 'No VAT charged (German small-business rule, § 19 UStG).'
      : 'Kein Ausweis von Umsatzsteuer gemäß § 19 UStG.'

  const seller = mapParty(
    settings.name,
    settings.sellerStreet,
    settings.sellerZip,
    settings.sellerCity,
    resolveCountryCode(settings.sellerCountryCode) ?? 'DE',
    settings.vatId,
  )
  const buyer = mapParty(
    client.name,
    client.street || client.address,
    client.zip,
    client.city,
    partyCountry(client.countryCode, client.country) ?? 'DE',
    client.vatId,
  )

  const vatBreakdown: ZugferdVatBreakdown = {
    calculatedAmount: money(invoice.taxAmount, currency),
    typeCode: 'VAT',
    basisAmount: money(invoice.subtotal, currency),
    categoryCode,
    rateApplicablePercent: ratePercent,
  }
  if (taxMode === 'reverse_charge') {
    vatBreakdown.exemptionReasonCode = REVERSE_CHARGE_CODE
    vatBreakdown.exemptionReasonText = reverseText
  } else if (taxMode === 'small_business' || taxMode === 'exempt') {
    vatBreakdown.exemptionReasonCode = 'VATEX-EU-O'
    vatBreakdown.exemptionReasonText = smallBusinessText
  }

  const transfers = settings.iban?.trim()
    ? [
        {
          accountName: settings.recipientName || settings.name,
          paymentAccountIdentifier: settings.iban.replace(/\s+/g, ''),
        },
      ]
    : undefined

  // German invoices need a Leistungsdatum/-zeitraum: a period when both service
  // dates are set, otherwise the issue date as the delivery date (BT-72).
  const hasPeriod = !!(invoice.servicePeriodStart && invoice.servicePeriodEnd)

  const data: ZugferdInvoiceData = {
    number: invoice.number ?? '',
    typeCode: invoice.correctsNumber ? '384' : '380',
    issueDate: isoToLocalDate(invoice.date),
    ...(invoice.correctsNumber
      ? { invoiceReferencedDocument: { issuerAssignedId: invoice.correctsNumber } }
      : {}),
    ...(invoice.notes?.trim() ? { includedNote: [{ content: invoice.notes.trim() }] } : {}),
    transaction: {
      line: invoice.items.map((item, i) => mapLine(item, i, categoryCode, ratePercent, currency)),
      tradeAgreement: { seller, buyer },
      tradeDelivery: hasPeriod ? {} : { information: { deliveryDate: isoToLocalDate(invoice.date) } },
      tradeSettlement: {
        currencyCode: currency,
        paymentInstruction: { typeCode: '58', ...(transfers ? { transfers } : {}) },
        ...(hasPeriod
          ? {
              invoicingPeriod: {
                startDate: isoToLocalDate(invoice.servicePeriodStart as string),
                endDate: isoToLocalDate(invoice.servicePeriodEnd as string),
              },
            }
          : {}),
        vatBreakdown: [vatBreakdown],
        paymentTerms: { dueDate: addDaysLocal(invoice.date, settings.paymentTermsDays || 0) },
        monetarySummation: {
          lineTotalAmount: money(invoice.subtotal, currency),
          taxBasisTotalAmount: money(invoice.subtotal, currency),
          taxTotal: { currencyCode: currency, amount: money(invoice.taxAmount, currency) },
          grandTotalAmount: money(invoice.total, currency),
          duePayableAmount: money(invoice.total, currency),
        },
      },
    },
  }

  return data
}
