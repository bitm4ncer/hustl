import type { Invoice, CompanySettings, Client, InvoiceTemplate } from '@shared/types'

export interface ExportResult {
  pdfPath: string
}

export interface InvoiceExporter {
  export(args: {
    invoice: Invoice
    client: Client
    settings: CompanySettings
    template?: InvoiceTemplate
    outDir: string
  }): Promise<ExportResult>
}
