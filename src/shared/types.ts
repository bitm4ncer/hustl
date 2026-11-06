export type DocumentLanguage = 'de' | 'en'

/**
 * Tax treatment of a document. `standard`/`reduced` use the document's
 * `taxRate`; the others are zero-rated but have different legal meanings.
 */
export type TaxMode =
  | 'standard'
  | 'reduced'
  | 'zero'
  | 'reverse_charge'
  | 'small_business'
  | 'exempt'

export interface CompanySettings {
  name: string
  subtitle: string
  addressLines: string[] // street, zip+city, country
  phone: string
  email: string
  taxNumber: string // Steuernummer, e.g. "12/345/67890"
  vatId: string // USt-IdNr, e.g. "DE123456789"
  iban: string
  bic: string
  bank: string
  paymentTermsDays: number // default 14
  recipientName: string // payee on the invoice footer
  // Structured seller postal address (EN 16931 BG-5). The PDF still renders
  // `addressLines`; these feed the machine-readable e-invoice XML.
  sellerStreet: string
  sellerZip: string
  sellerCity: string
  sellerCountryCode: string // ISO 3166-1 alpha-2, e.g. "DE"
  /** Default VAT rate as a fraction, e.g. 0.19. */
  defaultTaxRate: number
  /** Language for generated PDFs / e-invoice metadata (UI language is separate). */
  documentLanguage: DocumentLanguage
  // GoCardless Bank Account Data (ex-Nordigen) credentials for the N26 bank feed.
  gocardlessSecretId: string
  gocardlessSecretKey: string
  // E-Mail-Versand. Das SMTP-Passwort liegt NICHT hier, sondern verschlüsselt via
  // safeStorage (siehe src/main/email/secret.ts).
  smtp: SmtpSettings
  emailSubjectTemplate: string
  emailBodyTemplate: string
  emailSendMode: 'smtp' | 'client'
  // Angebote / Kostenvoranschläge
  kleinunternehmer: boolean // §19 UStG — Default-Steuermodus für Angebote
  offerValidityDays: number // Default-Bindefrist in Tagen (z. B. 14)
  offerNumberPrefix: string // z. B. 'ANG'
  offerIntroText: string
  offerClosingText: string
}

export interface Client {
  id: number
  notionId: string | null
  /** Firmenname. Steht als erste Zeile im Adressblock und ist der Käufer-Name
   *  in der E-Rechnung. */
  name: string
  /** Ansprechpartner oder Inhaber, zweite Zeile im Adressblock. */
  contactPerson: string
  /** Freie Zusatzzeile (z. B. „Kostenträger 102070"), dritte Zeile. */
  addressExtra: string
  address: string
  street: string
  zip: string
  city: string
  country: string
  /** ISO 3166-1 alpha-2; '' means "derive from country / default". */
  countryCode: string
  /** Default document currency for this client; '' = EUR. */
  currency: string
  /** Default document language; '' = company default. */
  language: DocumentLanguage | ''
  /** Default tax treatment for new invoices. */
  taxMode: TaxMode
  email: string
  hourlyRate: number
  /** @deprecated derived from taxMode; kept for existing data/callers. */
  noTax: boolean
  vatId: string | null
  notes: string
}

/** Aufschlüsselungs-Unterzeile eines Rechnungspostens. Rein darstellend —
 *  Beträge kommen IMMER vom Parent-Item, nie von Unterzeilen. */
export interface InvoiceSubItem {
  title: string
  description: string
  hours: number | null // optionaler "N Std"-Hinweis im PDF
}

export interface InvoiceItem {
  id: number
  invoiceId: number
  notionTaskId: string | null
  projectId: number | null
  position: number
  title: string
  description: string
  quantity: number | null
  unitPrice: number | null
  fixPrice: number | null
  amount: number
  subItems: InvoiceSubItem[]
}

export type ProjectStatus =
  | 'Active'
  | 'Forthcoming'
  | 'On Hold'
  | 'Done'
  | 'Archived'

/** Leistungsposition eines Projekts. Reine Aufschlüsselung — der Projektbetrag
 *  (Stunden × Satz bzw. Festpreis) wird von Positionen NIE beeinflusst. */
export interface ProjectItem {
  id: number
  projectId: number
  position: number
  title: string
  description: string
  hours: number | null // optionale individuelle Stunden (nur Info)
}

export interface Project {
  id: number
  notionId: string | null
  clientId: number | null
  clientName: string // derived via join; '' when no client
  title: string
  description: string
  status: ProjectStatus
  hours: number | null
  fixPrice: number | null
  hourlyRate: number // derived from the client (0 when no client)
  finalPrice: number // derived: fixPrice ?? (hours ?? Positions-Stunden) * hourlyRate
  timeframeStart: string | null // ISO date 'YYYY-MM-DD' or null
  timeframeEnd: string | null // ISO date or null
  note: string
  items: ProjectItem[]
}

export interface InvoicePreviewInput {
  clientId: number | null
  date: string
  servicePeriodStart: string | null
  servicePeriodEnd: string | null
  poNumber: string | null
  notes: string | null
  taxMode: TaxMode
  taxRate: number
  currency: string
  language: DocumentLanguage
  items: Array<{
    title: string
    description: string
    quantity: number | null
    unitPrice: number | null
    fixPrice: number | null
    projectId?: number | null
    subItems?: InvoiceSubItem[]
  }>
}

export type InvoiceStatus = 'draft' | 'finalized' | 'sent' | 'paid' | 'cancelled'

export interface Invoice {
  id: number
  number: string | null
  clientId: number
  date: string
  servicePeriodStart: string | null
  servicePeriodEnd: string | null
  status: InvoiceStatus
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  noTax: boolean
  reverseCharge: boolean
  taxMode: TaxMode
  /** ISO-4217 document currency. */
  currency: string
  /** Document currency → EUR rate at issue time (1 for EUR). */
  exchangeRate: number
  /** Language of the generated PDF / e-invoice metadata. */
  language: DocumentLanguage
  poNumber: string | null
  notes: string | null
  pdfPath: string | null
  hash: string | null
  prevHash: string | null
  finalizedAt: string | null
  paidAt: string | null
  emailSentAt: string | null
  emailRecipient: string | null
  /** Nummer der stornierten Rechnung — gesetzt bei einem Storno-Dokument. */
  correctsNumber: string | null
  items: InvoiceItem[]
}

export interface Expense {
  id: number
  vendor: string
  category: string
  date: string // Belegdatum 'YYYY-MM-DD'
  paidAt: string | null // Zahldatum 'YYYY-MM-DD'
  gross: number
  originalAmount: number | null // Betrag in originalCurrency; null bei EUR-Belegen
  originalCurrency: string // ISO-4217; 'EUR' wenn keine Fremdwährung
  vatRate: number // Prozent, z.B. 19
  note: string
  pdfPath: string | null
  sourceName: string | null
}

export type FixedCostInterval = 'monthly' | 'quarterly' | 'yearly'

export interface FixedCost {
  id: number
  name: string
  category: string
  gross: number
  vatRate: number
  interval: FixedCostInterval
  startDate: string // 'YYYY-MM-DD'
  endDate: string | null
  active: boolean
  note: string
}

export type FinanceBasis = 'cash' | 'accrual'
export type FinancePeriodKind = 'month' | 'quarter' | 'year' | 'all'

export interface MonthlyPoint {
  month: string // 'YYYY-MM'
  revenue: number
  expenses: number // variable expenses (receipts), excl. fixed costs
  fixedCosts: number
  profit: number
}

export interface FinanceSummary {
  revenue: number
  expenses: number // variable expenses total, excl. fixed costs
  fixedCosts: number
  profit: number
  vatCollected: number
  vatPaid: number
  vatBalance: number
  openRevenue: number // global snapshot of outstanding (finalized/sent, unpaid) invoices — NOT range-scoped
  openCount: number
  monthly: MonthlyPoint[]
}

export interface ForecastPoint {
  t: number // unix ms — day-accurate x position
  actual: number | null // cumulative realized revenue up to this date
  forecast: number | null // cumulative expected (realized baseline + pipeline)
  // Open projects whose pipeline lands on this date (the step's contributors),
  // shown on hover so it's clear where the expected money comes from.
  projects?: { title: string; amount: number }[]
}

export interface ForecastResult {
  points: ForecastPoint[]
  undatedPipeline: number
}

export interface BankTransaction {
  id: string
  accountId: string
  bookingDate: string
  amount: number // signed: >0 credit, <0 debit
  currency: string
  counterparty: string
  remittance: string
  kind: 'credit' | 'debit'
  status: 'unmatched' | 'matched' | 'ignored'
  matchedInvoiceId: number | null
  matchedExpenseId: number | null
  matchedFixedCostId: number | null
}

export interface BankStatus {
  connected: boolean
  accountIds: string[]
  lastSync: string | null
  needsReconsent: boolean
}

export interface MatchSuggestion {
  txId: string
  kind: 'credit' | 'debit'
  invoiceId?: number
  expenseId?: number
  fixedCostId?: number
  createExpense?: { vendor: string; gross: number; date: string }
  confidence: 'high' | 'low'
  /** Zeitlich bester Treffer: hervorgehoben, aber nicht automatisch übernommen. */
  recommended?: boolean
  label: string
}

/** What the user confirmed for a bank transaction in the reconcile view.
 *  `createExpense` carries the receipt PDF that the UI required the user to pick;
 *  amount + date come from the bank transaction (it is always booked in EUR). */
export type BankMatchChoice =
  | { invoiceId: number }
  | { expenseId: number }
  | { fixedCostId: number }
  | { createExpense: { vendor: string; gross: number; date: string; pdfPath: string; sourceName: string } }

/**
 * SMTP-Versandkonfiguration. Das Passwort liegt NICHT hier (sondern verschlüsselt
 * via Electron safeStorage in userData), damit es beim Settings-Speichern aus dem
 * Renderer nicht überschrieben wird.
 */
export interface SmtpSettings {
  host: string
  port: number
  secure: boolean // true = implizites TLS (465), false = STARTTLS (587)
  user: string
  fromName: string
  fromEmail: string
}

export interface TemplateMetaRow { label: string; value: string }
export type TemplateFontSource = 'local' | 'google' | 'fontshare'
export interface TemplateFontFile { weight: number; path: string }

/** Global, user-editable look of every invoice PDF. The e-invoice XML is
 *  unaffected — this only drives the human-readable PDF layer. */
export interface InvoiceTemplate {
  // Brand
  logoPath: string | null // file in userData/template/, base64-embedded at render
  logoWidthMm: number
  logoAlign: 'left' | 'right'
  accentColor: string // hex; drives the totals rule + uppercase labels
  // Font
  fontFamily: string
  fontSource: TemplateFontSource
  fontFiles: TemplateFontFile[] // empty ⇒ bundled Inter
  // Block visibility
  showSubtitle: boolean
  showTaxNumber: boolean
  showBankDetails: boolean
  showServicePeriod: boolean
  // Spacing (mm)
  marginTopMm: number
  marginXMm: number
  // Global texts
  introText: string
  closingText: string
  footerNote: string
  // Custom header meta rows
  metaRows: TemplateMetaRow[]
}

// --- Angebote / Kostenvoranschläge -----------------------------------------

export type OfferKind = 'angebot' | 'kostenvoranschlag'
export type OfferStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'invoiced'
/** regular = 19% USt · kleinunternehmer = §19 UStG · reverse_charge = §13b */
export type OfferTaxMode = 'regular' | 'kleinunternehmer' | 'reverse_charge'
export type OfferDiscountKind = 'none' | 'percent' | 'fixed'

export interface OfferProspect {
  name: string
  contactPerson: string
  addressExtra: string
  email: string
  street: string
  zip: string
  city: string
  country: string
  vatId: string
}

export interface OfferMilestone {
  label: string
  kind: 'percent' | 'amount'
  value: number
}

export interface OfferPaymentSchedule {
  depositPercent: number // 0 = keine Anzahlung
  milestones: OfferMilestone[]
}

export interface OfferItem {
  id: number
  offerId: number
  position: number
  section: string // '' = ohne Abschnitt
  title: string
  description: string
  quantity: number | null
  unit: string // 'Std' | 'Psch' | 'Seite' | '/Mon' | …
  unitPrice: number | null
  fixPrice: number | null
  amount: number
  optional: boolean
  recurring: boolean
  catalogItemId: number | null
  internalHours: number | null // Kalkulations-Hint, nie im PDF
}

export interface Offer {
  id: number
  number: string | null
  kind: OfferKind
  clientId: number | null
  clientName: string // derived via join; '' wenn Interessent
  prospect: OfferProspect
  title: string
  date: string
  validUntil: string
  servicePeriodStart: string | null
  servicePeriodEnd: string | null
  status: OfferStatus
  taxMode: OfferTaxMode
  taxRate: number
  currency: string
  exchangeRate: number
  language: DocumentLanguage
  freibleibend: boolean
  discountKind: OfferDiscountKind
  discountValue: number
  hourlyRate: number // interner Stundensatz für Stunden-Positionen; nie im PDF
  showHours: boolean // Stunden je Position im PDF ausweisen (Std × Satz)
  introText: string
  closingText: string
  paymentSchedule: OfferPaymentSchedule
  subtotal: number // Basissumme vor Rabatt (einmalig, nicht-optional)
  discountAmount: number
  taxAmount: number
  total: number
  recurringTotal: number
  acceptedAt: string | null
  acceptedBy: string | null
  acceptanceNote: string | null
  version: number
  parentOfferId: number | null
  convertedProjectId: number | null
  convertedInvoiceId: number | null
  emailSentAt: string | null
  emailRecipient: string | null
  pdfPath: string | null
  items: OfferItem[]
}

/** Editor-Zustand für Live-Vorschau & Pflichtprüfung (nichts persistiert). */
export interface OfferPreviewInput {
  kind: OfferKind
  clientId: number | null
  prospect: OfferProspect
  title: string
  date: string
  validUntil: string
  servicePeriodStart: string | null
  servicePeriodEnd: string | null
  taxMode: OfferTaxMode
  taxRate: number
  currency: string
  exchangeRate: number
  language: DocumentLanguage
  freibleibend: boolean
  discountKind: OfferDiscountKind
  discountValue: number
  hourlyRate: number
  showHours: boolean
  introText: string
  closingText: string
  paymentSchedule: OfferPaymentSchedule
  items: Array<{
    section: string
    title: string
    description: string
    quantity: number | null
    unit: string
    unitPrice: number | null
    fixPrice: number | null
    optional: boolean
    recurring: boolean
    catalogItemId: number | null
    internalHours: number | null
  }>
}

/** Wie oft erledigte Einträge einer Kategorie zurückgesetzt werden. */
export type TodoResetRule = 'none' | 'daily' | 'weekly' | 'monthly'

/** Eine Kategorie der Checkliste (Shopping, Groceries, …) — frei editierbar. */
export interface TodoCategoryRow {
  id: number
  name: string
  /** Planer = Tagesansicht, Regelmäßig = mit Reset, Liste = frei. */
  group: TodoGroup
  resetRule: TodoResetRule
  /** Wochentag 0–6 (0 = Sonntag) oder Monatstag 1–28. */
  resetDay: number | null
  position: number
}

export type TodoGroup = 'planner' | 'regular' | 'list'

export interface TodoStats {
  categoryId: number
  name: string
  /** Aufeinanderfolgende vollständig abgeschlossene Perioden. */
  streak: number
  best: number
  /** Älteste zuerst, höchstens acht Perioden. */
  periods: Array<{ start: string; total: number; done: number; completed: boolean }>
}

export interface Todo {
  id: number
  title: string
  /** Optionale Notiz (nur im Planer genutzt). */
  notes: string | null
  categoryId: number
  done: boolean
  doneAt: string | null
  /** Genauer Zeitpunkt des Abhakens (lokal, YYYY-MM-DD HH:MM:SS). */
  doneTs: string | null
  /** Anlage-Zeitpunkt (UTC, YYYY-MM-DD HH:MM:SS). */
  createdAt: string | null
  /** Tag im Planer (YYYY-MM-DD); null bei Listen/Regelmäßig. */
  date: string | null
  position: number
}
