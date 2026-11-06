import type {
  Client,
  Invoice,
  CompanySettings,
  Project,
  ProjectStatus,
  InvoiceStatus,
  InvoicePreviewInput,
  Expense,
  Todo,
  TodoCategoryRow,
  TodoStats,
  FixedCost,
  InvoiceTemplate,
  TemplateFontFile,
  TemplateFontSource,
  BankTransaction,
  BankMatchChoice,
  Offer,
  OfferStatus,
  OfferPreviewInput
} from '@shared/types'
import type { NumberSequence } from '../../core/db/number-sequence'
import type { ProjectInput } from '../../core/db/projects'
import type { ExpenseInput } from '../../core/db/expenses'
import type { FixedCostInput } from '../../core/db/fixed-costs'
import type { ExtractedFields } from '../../core/expense/pdf-extract'
import type { ExportResult } from '../../core/export/zip-exporter'
import type { OfferInput } from '../../core/db/offers'

export interface HustlApi {
  listClients(): Promise<Client[]>
  saveClient(input: Omit<Client, 'id'>, id?: number): Promise<number>
  listInvoices(): Promise<Invoice[]>
  getInvoice(id: number): Promise<Invoice | null>
  createDraft(input: Parameters<(typeof import('../../core/db/invoices'))['createDraft']>[1]): Promise<number>
  updateDraft(
    id: number,
    input: Parameters<(typeof import('../../core/db/invoices'))['createDraft']>[1]
  ): Promise<boolean>
  finalizeInvoice(id: number): Promise<{ pdfPath: string }>
  cancelAndCopyInvoice(id: number): Promise<number>
  regenerateInvoicePdf(id: number): Promise<{ pdfPath: string }>
  setInvoiceStatus(id: number, status: InvoiceStatus): Promise<void>
  renderInvoicePreview(input: InvoicePreviewInput): Promise<string>
  prevalidateEInvoice(input: InvoicePreviewInput): Promise<{ ok: boolean; errors: string[] }>
  getSettings(): Promise<CompanySettings>
  saveSettings(s: CompanySettings): Promise<void>
  getNumberSequence(year: number): Promise<NumberSequence | null>
  setNumberSequence(year: number, lastNumber: number): Promise<void>
  listProjects(): Promise<Project[]>
  getProject(id: number): Promise<Project | null>
  saveProject(input: ProjectInput, id?: number): Promise<number>
  setProjectStatus(id: number, status: ProjectStatus): Promise<void>
  deleteProject(id: number): Promise<void>
  reorderProjects(orderedIds: number[]): Promise<void>
  listOpenProjectsForClient(clientId: number): Promise<Project[]>
  listExpenses(): Promise<Expense[]>
  saveExpense(input: ExpenseInput, id?: number): Promise<number>
  deleteExpense(id: number): Promise<void>

  listTodos(): Promise<Todo[]>
  createTodo(input: { title: string; categoryId: number; date?: string | null }): Promise<number>
  listTodoCategories(): Promise<TodoCategoryRow[]>
  createTodoCategory(input: { name: string; resetRule: 'none' | 'daily' | 'weekly' | 'monthly'; resetDay?: number | null; group?: 'planner' | 'regular' | 'list' }): Promise<number>
  moveTodoToDate(id: number, date: string): Promise<void>
  todoStats(): Promise<TodoStats[]>
  setCategoryReset(id: number, rule: 'none' | 'daily' | 'weekly' | 'monthly', day: number | null): Promise<void>
  deleteTodoCategory(id: number): Promise<void>
  moveTodoCategory(id: number, delta: number): Promise<void>
  setTodoDone(id: number, done: boolean): Promise<void>
  renameTodo(id: number, title: string): Promise<void>
  deleteTodo(id: number): Promise<void>
  setTodoNotes(id: number, notes: string | null): Promise<void>
  moveTodo(id: number, delta: number): Promise<void>
  clearTodoCategory(id: number): Promise<void>
  setExpensePaid(id: number, paidAt: string | null): Promise<void>
  importExpensePdf(bytes: Uint8Array, filename: string): Promise<{ storedPath: string; fields: ExtractedFields; sourceName: string }>
  listFixedCosts(): Promise<FixedCost[]>
  saveFixedCost(input: FixedCostInput, id?: number): Promise<number>
  deleteFixedCost(id: number): Promise<void>
  setInvoicePaid(id: number, paid: boolean): Promise<void>
  exportFinanceMonth(yearMonth: string): Promise<ExportResult | null>
  getInvoiceTemplate(): Promise<InvoiceTemplate>
  saveInvoiceTemplate(t: InvoiceTemplate): Promise<void>
  listTemplateFonts(): Promise<{ google: { family: string }[]; fontshare: { family: string }[] }>
  downloadTemplateFont(family: string, source: TemplateFontSource): Promise<{ family: string; source: TemplateFontSource; fontFiles: TemplateFontFile[] }>
  renderTemplatePreview(template: InvoiceTemplate): Promise<string>
  bankListTransactions(filter?: {
    status?: 'unmatched' | 'matched' | 'ignored'
  }): Promise<BankTransaction[]>
  bankApplyMatch(txId: string, choice: BankMatchChoice): Promise<void>
  bankIgnore(txId: string): Promise<void>
  importBankStatement(bytes: Uint8Array, filename: string): Promise<{ yearMonth: string; imported: number; ignored: number } | null>
  listOffers(): Promise<Offer[]>
  getOffer(id: number): Promise<Offer | null>
  saveOffer(input: OfferInput, id?: number): Promise<number>
  setOfferStatus(id: number, status: OfferStatus): Promise<void>
  deleteOffer(id: number): Promise<void>
  renderOfferPreview(input: OfferPreviewInput): Promise<string>
  prevalidateOffer(input: OfferPreviewInput): Promise<{ ok: boolean; errors: string[] }>
  finalizeOfferPdf(id: number): Promise<{ pdfPath: string }>
  createOfferClient(id: number): Promise<{ clientId: number; clientName: string; created: boolean }>
  convertOfferToProject(id: number): Promise<{ projectId: number; projectTitle: string; created: boolean }>
}

export const CH = {
  listClients: 'clients:list',
  saveClient: 'clients:save',
  listInvoices: 'invoices:list',
  getInvoice: 'invoices:get',
  createDraft: 'invoices:createDraft',
  updateDraft: 'invoices:updateDraft',
  finalizeInvoice: 'invoices:finalize',
  cancelAndCopyInvoice: 'invoices:cancelAndCopy',
  regenerateInvoicePdf: 'invoices:regeneratePdf',
  setInvoiceStatus: 'invoices:setStatus',
  renderInvoicePreview: 'invoice:preview',
  prevalidateEInvoice: 'invoice:prevalidateEInvoice',
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  getNumberSequence: 'numbering:get',
  setNumberSequence: 'numbering:set',
  listProjects: 'projects:list',
  getProject: 'projects:get',
  saveProject: 'projects:save',
  setProjectStatus: 'projects:setStatus',
  deleteProject: 'projects:delete',
  reorderProjects: 'projects:reorder',
  listOpenProjectsForClient: 'projects:listOpenForClient',
  listExpenses: 'expenses:list',
  saveExpense: 'expenses:save',
  deleteExpense: 'expenses:delete',
  listTodos: 'todos:list',
  createTodo: 'todos:create',
  setTodoDone: 'todos:done',
  renameTodo: 'todos:rename',
  deleteTodo: 'todos:delete',
  setTodoNotes: 'todos:notes',
  moveTodo: 'todos:move',
  clearTodoCategory: 'todos:clear',
  listTodoCategories: 'todos:categories',
  createTodoCategory: 'todos:category:create',
  deleteTodoCategory: 'todos:category:delete',
  moveTodoCategory: 'todos:category:move',
  moveTodoToDate: 'todos:move-date',
  todoStats: 'todos:stats',
  setCategoryReset: 'todos:category:reset',
  setExpensePaid: 'expenses:setPaid',
  importExpensePdf: 'expenses:importPdf',
  listFixedCosts: 'fixedCosts:list',
  saveFixedCost: 'fixedCosts:save',
  deleteFixedCost: 'fixedCosts:delete',
  setInvoicePaid: 'invoices:setPaid',
  exportFinanceMonth: 'finance:exportMonth',
  getInvoiceTemplate: 'template:get',
  saveInvoiceTemplate: 'template:save',
  listTemplateFonts: 'template:listFonts',
  downloadTemplateFont: 'template:downloadFont',
  renderTemplatePreview: 'template:preview',
  bankListTransactions: 'bank:listTransactions',
  bankApplyMatch: 'bank:applyMatch',
  bankIgnore: 'bank:ignore',
  importBankStatement: 'bank:importStatement',
  listOffers: 'offers:list',
  getOffer: 'offers:get',
  saveOffer: 'offers:save',
  setOfferStatus: 'offers:setStatus',
  deleteOffer: 'offers:delete',
  renderOfferPreview: 'offers:preview',
  prevalidateOffer: 'offers:prevalidate',
  finalizeOfferPdf: 'offers:finalizePdf',
  createOfferClient: 'offers:createClient',
  convertOfferToProject: 'offers:toProject',
} as const
