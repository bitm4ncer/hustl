import { ipcMain, dialog } from 'electron'
import { electronPlatform } from '../../platform/electron'
import type {
  Client,
  CompanySettings,
  ProjectStatus,
  InvoiceStatus,
  InvoicePreviewInput,
  InvoiceTemplate,
  TemplateFontSource,
  BankMatchChoice,
  OfferPreviewInput
} from '@shared/types'
import { getDb } from '../../core/db/connection'
import { listClients, createClient, updateClient, getClientById } from '../../core/db/clients'
import {
  listInvoices,
  getInvoice,
  createDraft,
  updateDraft,
  cancelAndCopyInvoice,
  setInvoiceStatus,
  setInvoicePaid,
} from '../../core/db/invoices'
import {
  listExpenses, createExpense, updateExpense, deleteExpense, setExpensePaid,
  type ExpenseInput,
} from '../../core/db/expenses'
import { listTodos, createTodo, setTodoDone, renameTodo, deleteTodo, listTodoCategories, createTodoCategory, deleteTodoCategory, moveTodoCategory, setCategoryReset, moveTodoToDate, listTodoStats, clearTodoCategory, setTodoNotes, moveTodo } from '../../core/db/todos'
import {
  listFixedCosts, createFixedCost, updateFixedCost, deleteFixedCost, type FixedCostInput,
} from '../../core/db/fixed-costs'
import { exportMonth } from '../../core/export/zip-exporter'
import { assertExportable } from '@shared/zugferd-map'
import {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  setProjectStatus,
  deleteProject,
  reorderProjects,
  listOpenProjectsForClient,
  type ProjectInput
} from '../../core/db/projects'
import { getSettings, saveSettings } from '../../core/db/settings'
import { getInvoiceTemplate, saveInvoiceTemplate } from '../../core/db/invoice-template'
import { getNumberSequence, setNumberSequence } from '../../core/db/number-sequence'
import { listTransactions, setTransactionMatch, type TransactionFilter } from '../../core/db/bank'
import { applyBankMatch } from '../../core/bank/match'
import { importStatement } from '../../core/bank/statement-import'
import {
  listOffers, getOffer, createOffer, updateOffer, setOfferStatus,
  deleteOffer, type OfferInput,
} from '../../core/db/offers'
import { ensureOfferClient, convertOfferToProject } from '../../core/db/offer-convert'
import {
  finalizeInvoiceWithPdf,
  regenerateInvoicePdfWithPdf,
  finalizeOfferWithPdf,
  invoicePreviewHtml,
  offerPreviewHtml,
  templatePreviewHtml,
  importExpensePdfBytes,
  type OpContext,
} from '../../core/operations'
import { buildPreviewInvoice, validateOffer } from '../../core/previews'
import { CH } from './channels'

/** Alles, was die gemeinsamen Operationen brauchen — Electron-Variante. */
const opCtx = (): OpContext => ({
  db: getDb(),
  dataDir: electronPlatform.dataDir,
  platform: electronPlatform,
})

export function registerIpcHandlers(): void {
  ipcMain.handle(CH.listClients, () => listClients(getDb()))

  ipcMain.handle(CH.saveClient, (_e, input: Omit<Client, 'id'>, id?: number) => {
    const db = getDb()
    if (id != null) {
      updateClient(db, id, input)
      return id
    }
    return createClient(db, input)
  })

  ipcMain.handle(CH.listInvoices, () => listInvoices(getDb()))

  ipcMain.handle(CH.getInvoice, (_e, id: number) => getInvoice(getDb(), id))

  ipcMain.handle(CH.createDraft, (_e, input: Parameters<typeof createDraft>[1]) =>
    createDraft(getDb(), input)
  )

  ipcMain.handle(
    CH.updateDraft,
    (_e, id: number, input: Parameters<typeof updateDraft>[2]) => updateDraft(getDb(), id, input)
  )

  // Storno + Korrektur: the original invoice is cancelled (never rewritten) and
  // a fresh draft copy is returned so the renderer can open it in the editor.
  ipcMain.handle(CH.cancelAndCopyInvoice, (_e, id: number) =>
    cancelAndCopyInvoice(getDb(), id)
  )

  ipcMain.handle(CH.finalizeInvoice, (_e, id: number) => finalizeInvoiceWithPdf(opCtx(), id))

  // Re-render a finalized invoice's PDF/e-invoice from the CURRENT client,
  // settings and template — without changing number, status or amounts. Used to
  // pick up corrected master data (e.g. a renamed client / fixed address). The
  // gapless number and audit chain are untouched, so this stays GoBD-safe.
  ipcMain.handle(CH.regenerateInvoicePdf, (_e, id: number) =>
    regenerateInvoicePdfWithPdf(opCtx(), id)
  )

  ipcMain.handle(CH.setInvoiceStatus, (_e, id: number, status: InvoiceStatus) =>
    setInvoiceStatus(getDb(), id, status)
  )

  ipcMain.handle(CH.renderInvoicePreview, (_e, input: InvoicePreviewInput): string =>
    invoicePreviewHtml(opCtx(), input)
  )

  // Pre-validate that the current editor state can produce a compliant
  // e-invoice — called before createDraft so finalising never fails after a
  // number has been assigned. Returns human-readable German problems.
  ipcMain.handle(CH.prevalidateEInvoice, (_e, input: InvoicePreviewInput) => {
    const built = buildPreviewInvoice(getDb(), input)
    if (!built) return { ok: false, errors: ['Bitte zuerst einen Kunden wählen.'] }
    const errors = assertExportable(built.invoice, built.client, built.settings)
    return { ok: errors.length === 0, errors }
  })

  ipcMain.handle(CH.getSettings, () => getSettings(getDb()))

  ipcMain.handle(CH.saveSettings, (_e, s: CompanySettings) => saveSettings(getDb(), s))

  ipcMain.handle(CH.getNumberSequence, (_e, year: number) => getNumberSequence(getDb(), year))

  ipcMain.handle(CH.setNumberSequence, (_e, year: number, lastNumber: number) =>
    setNumberSequence(getDb(), year, lastNumber)
  )

  ipcMain.handle(CH.listProjects, () => listProjects(getDb()))

  ipcMain.handle(CH.getProject, (_e, id: number) => getProjectById(getDb(), id))

  ipcMain.handle(CH.saveProject, (_e, input: ProjectInput, id?: number) => {
    const db = getDb()
    if (id != null) {
      updateProject(db, id, input)
      return id
    }
    return createProject(db, input)
  })

  ipcMain.handle(CH.setProjectStatus, (_e, id: number, status: ProjectStatus) =>
    setProjectStatus(getDb(), id, status)
  )

  ipcMain.handle(CH.deleteProject, (_e, id: number) => deleteProject(getDb(), id))

  ipcMain.handle(CH.reorderProjects, (_e, ids: number[]) => reorderProjects(getDb(), ids))

  ipcMain.handle(CH.listOpenProjectsForClient, (_e, clientId: number) =>
    listOpenProjectsForClient(getDb(), clientId)
  )

  // --- Ausgaben ---
  ipcMain.handle(CH.listExpenses, () => listExpenses(getDb()))

  ipcMain.handle(CH.saveExpense, (_e, input: ExpenseInput, id?: number) => {
    const db = getDb()
    if (id != null) {
      updateExpense(db, id, input)
      return id
    }
    return createExpense(db, input)
  })

  ipcMain.handle(CH.deleteExpense, (_e, id: number) => deleteExpense(getDb(), id))

  // --- To-Dos ---
  ipcMain.handle(CH.listTodos, () => listTodos(getDb()))
  ipcMain.handle(CH.createTodo, (_e, input: { title: string; categoryId: number; date?: string | null }) =>
    createTodo(getDb(), input),
  )
  ipcMain.handle(CH.setTodoDone, (_e, id: number, done: boolean) => setTodoDone(getDb(), id, done))
  ipcMain.handle(CH.renameTodo, (_e, id: number, title: string) => renameTodo(getDb(), id, title))
  ipcMain.handle(CH.deleteTodo, (_e, id: number) => deleteTodo(getDb(), id))
  ipcMain.handle(CH.listTodoCategories, () => listTodoCategories(getDb()))
  ipcMain.handle(CH.createTodoCategory, (_e, input: { name: string; resetRule: 'none' | 'daily' | 'weekly' | 'monthly'; resetDay?: number | null; group?: 'planner' | 'regular' | 'list' }) =>
    createTodoCategory(getDb(), input),
  )
  ipcMain.handle(CH.deleteTodoCategory, (_e, id: number) => deleteTodoCategory(getDb(), id))
  ipcMain.handle(CH.moveTodoCategory, (_e, id: number, delta: number) =>
    moveTodoCategory(getDb(), id, delta),
  )
  ipcMain.handle(
    CH.setCategoryReset,
    (_e, id: number, rule: 'none' | 'daily' | 'weekly' | 'monthly', day: number | null) =>
      setCategoryReset(getDb(), id, rule, day),
  )
  ipcMain.handle(CH.moveTodoToDate, (_e, id: number, date: string) => moveTodoToDate(getDb(), id, date))
  ipcMain.handle(CH.todoStats, () => listTodoStats(getDb()))
  ipcMain.handle(CH.clearTodoCategory, (_e, id: number) => clearTodoCategory(getDb(), id))
  ipcMain.handle(CH.setTodoNotes, (_e, id: number, notes: string | null) => setTodoNotes(getDb(), id, notes))
  ipcMain.handle(CH.moveTodo, (_e, id: number, delta: number) => moveTodo(getDb(), id, delta))

  ipcMain.handle(CH.setExpensePaid, (_e, id: number, paidAt: string | null) =>
    setExpensePaid(getDb(), id, paidAt),
  )

  ipcMain.handle(CH.importExpensePdf, (_e, bytes: Uint8Array, filename: string) =>
    importExpensePdfBytes(opCtx(), bytes, filename)
  )

  // --- Fixkosten ---
  ipcMain.handle(CH.listFixedCosts, () => listFixedCosts(getDb()))

  ipcMain.handle(CH.saveFixedCost, (_e, input: FixedCostInput, id?: number) => {
    const db = getDb()
    if (id != null) {
      updateFixedCost(db, id, input)
      return id
    }
    return createFixedCost(db, input)
  })

  ipcMain.handle(CH.deleteFixedCost, (_e, id: number) => deleteFixedCost(getDb(), id))

  // --- Rechnungen: Bezahlt-Toggle ---
  ipcMain.handle(CH.setInvoicePaid, (_e, id: number, paid: boolean) =>
    setInvoicePaid(getDb(), id, paid),
  )

  // --- Export ---
  ipcMain.handle(CH.exportFinanceMonth, async (_e, yearMonth: string) => {
    const res = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Zielordner für den Export wählen',
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return exportMonth(getDb(), yearMonth, res.filePaths[0], electronPlatform.dataDir, { allowAbsolute: true })
  })

  // --- Template ---
  ipcMain.handle(CH.renderTemplatePreview, (_e, template: InvoiceTemplate): string =>
    templatePreviewHtml(opCtx(), template)
  )

  ipcMain.handle(CH.getInvoiceTemplate, () => getInvoiceTemplate(getDb()))

  ipcMain.handle(CH.saveInvoiceTemplate, (_e, t: InvoiceTemplate) =>
    saveInvoiceTemplate(getDb(), t),
  )

  ipcMain.handle(CH.listTemplateFonts, async () => {
    const google = (await import('../../core/fonts/google-families.json')).default
    const fontshare = (await import('../../core/fonts/fontshare-families.json')).default
    return { google, fontshare }
  })

  ipcMain.handle(CH.downloadTemplateFont, async (_e, family: string, source: TemplateFontSource) => {
    const { downloadFont } = await import('../../core/fonts/font-download')
    const fontFiles = await downloadFont(family, source, electronPlatform.dataDir)
    return { family, source, fontFiles }
  })

  ipcMain.handle(CH.bankListTransactions, (_e, filter?: TransactionFilter) =>
    listTransactions(getDb(), filter),
  )

  ipcMain.handle(CH.bankApplyMatch, (_e, txId: string, choice: BankMatchChoice) =>
    applyBankMatch(getDb(), txId, choice)
  )

  ipcMain.handle(CH.bankIgnore, (_e, txId: string) =>
    setTransactionMatch(getDb(), txId, { status: 'ignored' }),
  )

  ipcMain.handle(CH.importBankStatement, (_e, bytes: Uint8Array, filename: string) =>
    importStatement(getDb(), bytes, filename, electronPlatform.dataDir)
  )
  // --- Angebote ---
  ipcMain.handle(CH.listOffers, () => listOffers(getDb()))
  ipcMain.handle(CH.getOffer, (_e, id: number) => getOffer(getDb(), id))

  ipcMain.handle(CH.saveOffer, (_e, input: OfferInput, id?: number) => {
    const db = getDb()
    if (id != null) { updateOffer(db, id, input); return id }
    return createOffer(db, input)
  })

  ipcMain.handle(CH.setOfferStatus, (_e, id: number, status: import('@shared/types').OfferStatus) =>
    setOfferStatus(getDb(), id, status))

  ipcMain.handle(CH.deleteOffer, (_e, id: number) => deleteOffer(getDb(), id))

  ipcMain.handle(CH.renderOfferPreview, (_e, input: OfferPreviewInput): string =>
    offerPreviewHtml(opCtx(), input)
  )

  ipcMain.handle(CH.prevalidateOffer, (_e, input: OfferPreviewInput) => {
    const errors = validateOffer(input)
    return { ok: errors.length === 0, errors }
  })

  ipcMain.handle(CH.finalizeOfferPdf, (_e, id: number) => finalizeOfferWithPdf(opCtx(), id))

  // Angebot -> Stammdaten: Interessent wird Kunde, Angebot wird Projekt.
  ipcMain.handle(CH.createOfferClient, (_e, id: number) => {
    const db = getDb()
    const { clientId, created } = ensureOfferClient(db, id)
    return { clientId, clientName: getClientById(db, clientId)?.name ?? '', created }
  })

  ipcMain.handle(CH.convertOfferToProject, (_e, id: number) => {
    const db = getDb()
    const { projectId, created } = convertOfferToProject(db, id)
    return { projectId, projectTitle: getProjectById(db, projectId)?.title ?? '', created }
  })
}
