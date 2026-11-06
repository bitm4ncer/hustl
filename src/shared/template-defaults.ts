import type { InvoiceTemplate } from './types'

/** Neutral by default: no logo, black body text, a soft grey accent for the
 *  totals rule + uppercase labels, bundled Inter. Looks like the current PDF. */
export const DEFAULT_TEMPLATE: InvoiceTemplate = {
  logoPath: null,
  logoWidthMm: 34,
  logoAlign: 'right',
  accentColor: '#666666',
  fontFamily: 'Inter',
  fontSource: 'local',
  fontFiles: [],
  showSubtitle: true,
  showTaxNumber: true,
  showBankDetails: true,
  showServicePeriod: true,
  marginTopMm: 20,
  marginXMm: 15,
  introText: '',
  closingText: '',
  footerNote: '',
  metaRows: [],
}
