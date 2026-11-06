import fs from 'node:fs'
import type { InvoiceTemplate } from '@shared/types'
import { INTER_400_WOFF2, INTER_700_WOFF2 } from './fonts'

/** HTML-escape interpolated text values to avoid breaking markup. */
export function esc(str: string): string {
  return str.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string,
  )
}

/** Escape + convert newlines to <br>. */
export function escMultiline(s: string): string {
  return esc(s).replace(/\n/g, '<br>')
}

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
}

export function fontFaceCss(t: InvoiceTemplate): string {
  if (t.fontFiles.length) {
    const faces = t.fontFiles
      .map((f) => {
        try {
          const b64 = fs.readFileSync(f.path).toString('base64')
          return `@font-face{font-family:'${t.fontFamily}';font-style:normal;font-weight:${f.weight};font-display:swap;src:url('data:font/woff2;base64,${b64}') format('woff2');}`
        } catch {
          return ''
        }
      })
      .filter(Boolean)
      .join('\n')
    if (faces) return faces
  }
  return `
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('data:font/woff2;base64,${INTER_400_WOFF2}') format('woff2');
}
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: url('data:font/woff2;base64,${INTER_700_WOFF2}') format('woff2');
}`
}

export function logoImg(t: InvoiceTemplate): string {
  if (!t.logoPath) return ''
  try {
    const ext = t.logoPath.slice(t.logoPath.lastIndexOf('.')).toLowerCase()
    const mime = MIME[ext] ?? 'image/png'
    const b64 = fs.readFileSync(t.logoPath).toString('base64')
    const side = t.logoAlign === 'right' ? 'right:0' : 'left:0'
    return `<img src="data:${mime};base64,${b64}" style="position:absolute;top:0;${side};width:${t.logoWidthMm}mm;height:auto" alt="">`
  } catch {
    return ''
  }
}

// All CSS rules shared by invoice + offer documents (layout, not colours).
export const STYLE_REST = `
* {
  box-sizing: border-box;
}

@page {
  size: A4;
  margin: 0;
}

.header {
  position: relative;
  width: 100%;
  height: 35mm;
  margin-bottom: 40mm;
}

.company-info {
  position: absolute;
  left: 0;
  top: 0;
  width: 110mm;
}

.company-name {
  font-size: 20pt;
  font-weight: bold;
  letter-spacing: 1px;
}

.company-subtitle {
  font-size: 13pt;
  margin-bottom: 8mm;
}

.contact-info {
  font-size: 9pt;
  line-height: 1.3;
  width: 100%;
}

.contact-left {
  float: left;
  width: 50mm;
}

.contact-right {
  float: right;
  width: 50mm;
  text-align: right;
}

.address-invoice-section {
  position: relative;
  width: 100%;
  margin-bottom: 25mm;
  min-height: 15mm;
}

.client-address-inline {
  position: absolute;
  left: 0;
  top: 0;
  width: 80mm;
  font-size: 9pt;
  line-height: 1.4;
}

.invoice-meta-inline {
  position: absolute;
  right: 0;
  top: 0;
  width: 60mm;
  text-align: right;
  font-size: 9pt;
}

.invoice-meta-inline div {
  margin-bottom: 2mm;
  white-space: nowrap;
  text-align: right;
}

.invoice-meta-inline strong {
  text-align: right;
}

.service-list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: none;
}

.service-item {
  margin-bottom: 0;
  position: relative;
  width: 100%;
  min-height: 5mm;
  font-size: 9pt;
  list-style: none;
  border: none;
}

.service-description {
  position: absolute;
  left: 0;
  top: 0;
  width: 130mm;
}

.service-price {
  position: absolute;
  right: 0;
  top: 0;
  width: 30mm;
  text-align: right;
}

.totals-section {
  margin-top: 10mm;
  margin-bottom: 20mm;
  width: 100%;
  padding-top: 3mm;
}

.totals-line {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  width: 100%;
  margin-bottom: 2mm;
  font-size: 9pt;
  text-align: right;
}

.totals-line.total {
  font-weight: bold;
}

.totals-content {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  width: 55mm;
  text-align: right;
}

.totals-label {
  text-transform: uppercase;
  font-weight: bold;
  text-align: right;
  margin-right: 3mm;
}

.totals-amount {
  text-align: right;
}

.reverse-charge-note {
  font-style: italic;
  text-align: right;
  width: 100%;
  font-size: 8pt;
}

.footer-section {
  padding-top: 10mm;
  font-size: 9pt;
  margin-top: 20mm;
}

.payment-info {
  margin-bottom: 8mm;
}

.payment-info div {
  margin-bottom: 2mm;
}

.payment-info strong {
  display: inline-block;
  width: 25mm;
}

.payment-terms {
  position: relative;
  width: 100%;
  margin-top: 8mm;
  min-height: 15mm;
}

.payment-terms-left {
  position: absolute;
  left: 0;
  top: 0;
  width: 120mm;
  font-size: 7pt;
  line-height: 1.3;
}

.payment-terms-right {
  position: absolute;
  right: 0;
  top: 0;
  width: 60mm;
  text-align: right;
  font-size: 9pt;
}

.clearfix::after {
  content: "";
  display: table;
  clear: both;
}

.address-invoice-section {
  page-break-inside: avoid;
}

.service-list {
  page-break-inside: avoid;
}

.service-item {
  page-break-inside: avoid;
}

.totals-section {
  page-break-inside: avoid;
}

.footer-section {
  page-break-inside: avoid;
}
`
