/** Optionen, die der jeweilige Renderer auf `printToPDF`/`page.pdf` abbildet. */
export interface PdfOptions {
  displayHeaderFooter?: boolean
  headerTemplate?: string
  footerTemplate?: string
  margins?: { top: number; bottom: number; left: number; right: number }
}

/** HTML → PDF. Electron nutzt `printToPDF`, der Server headless Chromium. */
export type PdfRenderer = (html: string, options?: PdfOptions) => Promise<Uint8Array>

export interface Platform {
  readonly kind: 'electron' | 'web'
  /** Absoluter Wurzelpfad aller Nutzdaten. */
  readonly dataDir: string
  renderPdf: PdfRenderer
}
