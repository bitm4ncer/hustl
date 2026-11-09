import { z } from 'zod'
import type { DatabaseSync } from 'node:sqlite'
import type { BankMatchChoice, InvoiceStatus, OfferStatus, ProjectStatus } from '@shared/types'
import { assertExportable } from '@shared/zugferd-map'
import { getInvoice, listInvoices, createDraft, updateDraft, cancelAndCopyInvoice, setInvoiceStatus, setInvoicePaid } from '../../core/db/invoices'
import { listClients, createClient, updateClient, getClientById } from '../../core/db/clients'
import { getSettings, saveSettings } from '../../core/db/settings'
import { getInvoiceTemplate, saveInvoiceTemplate } from '../../core/db/invoice-template'
import { getNumberSequence, setNumberSequence } from '../../core/db/number-sequence'
import { listProjects, getProjectById, createProject, updateProject, setProjectStatus, deleteProject, reorderProjects, listOpenProjectsForClient } from '../../core/db/projects'
import { listExpenses, createExpense, updateExpense, deleteExpense, setExpensePaid } from '../../core/db/expenses'
import { listFixedCosts, createFixedCost, updateFixedCost, deleteFixedCost } from '../../core/db/fixed-costs'
import { listTransactions, setTransactionMatch } from '../../core/db/bank'
import { applyBankMatch } from '../../core/bank/match'
import { listTodos, createTodo, setTodoDone, renameTodo, deleteTodo, listTodoCategories, createTodoCategory, deleteTodoCategory, moveTodoCategory, setCategoryReset, moveTodoToDate, listTodoStats, clearTodoCategory, setTodoNotes, moveTodo } from '../../core/db/todos'
import { importStatement } from '../../core/bank/statement-import'
import { listOffers, getOffer, createOffer, updateOffer, setOfferStatus, deleteOffer } from '../../core/db/offers'
import { ensureOfferClient, convertOfferToProject } from '../../core/db/offer-convert'
import { downloadFont } from '../../core/fonts/font-download'
import googleFamilies from '../../core/fonts/google-families.json'
import fontshareFamilies from '../../core/fonts/fontshare-families.json'
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
import type { Platform } from '../../platform/types'

export interface RpcContext {
  db: DatabaseSync
  dataDir: string
  platform: Platform
}

export function rpcContext(db: DatabaseSync, dataDir: string, platform: Platform): RpcContext {
  return { db, dataDir, platform }
}

export interface RpcEntry {
  /** Validiert das komplette `args`-Array. */
  schema: z.ZodType<unknown[]>
  handler: (ctx: RpcContext, args: any[]) => Promise<unknown> | unknown
}

const id = z.number().int().positive()
// JSON kennt kein `undefined`: optionale IDs kommen als `null` an, sobald der
// Client `undefined` mitschickt (z. B. `api.saveExpense(draft, editId ?? undefined)`).
// Ohne `nullish()` scheitert das Anlegen jedes neuen Datensatzes mit VALIDATION.
const optionalId = z
  .number()
  .int()
  .positive()
  .nullish()
  .transform((value) => value ?? undefined)

const INVOICE_STATUS = z.enum(['draft', 'finalized', 'sent', 'paid', 'cancelled'])
const PROJECT_STATUS = z.enum(['Active', 'Forthcoming', 'On Hold', 'Done', 'Archived'])
const OFFER_STATUS = z.enum(['draft', 'sent', 'accepted', 'declined', 'invoiced'])

function ops(ctx: RpcContext): OpContext {
  return {
    db: ctx.db,
    dataDir: ctx.dataDir,
    platform: ctx.platform,
  }
}

/**
 * Allowlist aller im Web erreichbaren Methoden. Kein dynamischer Import:
 * eine Methode, die hier nicht steht, existiert für den Server nicht.
 */
export const RPC: Record<string, RpcEntry> = {
  // --- Kunden ---
  listClients: { schema: z.tuple([]), handler: (ctx) => listClients(ctx.db) },
  saveClient: {
    schema: z.tuple([z.record(z.string(), z.unknown()), optionalId]),
    handler: (ctx, [input, clientId]) => {
      if (clientId != null) {
        updateClient(ctx.db, clientId, input as any)
        return clientId
      }
      return createClient(ctx.db, input as any)
    },
  },

  // --- Rechnungen ---
  listInvoices: { schema: z.tuple([]), handler: (ctx) => listInvoices(ctx.db) },
  getInvoice: { schema: z.tuple([id]), handler: (ctx, [invoiceId]) => getInvoice(ctx.db, invoiceId) },
  createDraft: {
    schema: z.tuple([z.record(z.string(), z.unknown())]),
    handler: (ctx, [input]) => createDraft(ctx.db, input as any),
  },
  updateDraft: {
    schema: z.tuple([id, z.record(z.string(), z.unknown())]),
    handler: (ctx, [invoiceId, input]) => updateDraft(ctx.db, invoiceId, input as any),
  },
  finalizeInvoice: {
    schema: z.tuple([id]),
    handler: (ctx, [invoiceId]) => finalizeInvoiceWithPdf(ops(ctx), invoiceId),
  },
  cancelAndCopyInvoice: {
    schema: z.tuple([id]),
    handler: (ctx, [invoiceId]) => cancelAndCopyInvoice(ctx.db, invoiceId),
  },
  regenerateInvoicePdf: {
    schema: z.tuple([id]),
    handler: (ctx, [invoiceId]) => regenerateInvoicePdfWithPdf(ops(ctx), invoiceId),
  },
  setInvoiceStatus: {
    schema: z.tuple([id, INVOICE_STATUS]),
    handler: (ctx, [invoiceId, status]) => setInvoiceStatus(ctx.db, invoiceId, status as InvoiceStatus),
  },
  setInvoicePaid: {
    schema: z.tuple([id, z.boolean()]),
    handler: (ctx, [invoiceId, paid]) => setInvoicePaid(ctx.db, invoiceId, paid),
  },
  renderInvoicePreview: {
    schema: z.tuple([z.record(z.string(), z.unknown())]),
    handler: (ctx, [input]) => invoicePreviewHtml(ops(ctx), input as any),
  },
  prevalidateEInvoice: {
    schema: z.tuple([z.record(z.string(), z.unknown())]),
    handler: (ctx, [input]) => {
      const built = buildPreviewInvoice(ctx.db, input as any)
      if (!built) return { ok: false, errors: ['Bitte zuerst einen Kunden wählen.'] }
      const errors = assertExportable(built.invoice, built.client, built.settings)
      return { ok: errors.length === 0, errors }
    },
  },

  // --- Einstellungen / Nummernkreis ---
  getSettings: { schema: z.tuple([]), handler: (ctx) => getSettings(ctx.db) },
  saveSettings: {
    schema: z.tuple([z.record(z.string(), z.unknown())]),
    handler: (ctx, [settings]) => saveSettings(ctx.db, settings as any),
  },
  getNumberSequence: {
    schema: z.tuple([z.number().int()]),
    handler: (ctx, [year]) => getNumberSequence(ctx.db, year),
  },
  setNumberSequence: {
    schema: z.tuple([z.number().int(), z.number().int().nonnegative()]),
    handler: (ctx, [year, lastNumber]) => setNumberSequence(ctx.db, year, lastNumber),
  },

  // --- Projekte ---
  listProjects: { schema: z.tuple([]), handler: (ctx) => listProjects(ctx.db) },
  getProject: { schema: z.tuple([id]), handler: (ctx, [projectId]) => getProjectById(ctx.db, projectId) },
  saveProject: {
    schema: z.tuple([z.record(z.string(), z.unknown()), optionalId]),
    handler: (ctx, [input, projectId]) => {
      if (projectId != null) {
        updateProject(ctx.db, projectId, input as any)
        return projectId
      }
      return createProject(ctx.db, input as any)
    },
  },
  setProjectStatus: {
    schema: z.tuple([id, PROJECT_STATUS]),
    handler: (ctx, [projectId, status]) => setProjectStatus(ctx.db, projectId, status as ProjectStatus),
  },
  deleteProject: { schema: z.tuple([id]), handler: (ctx, [projectId]) => deleteProject(ctx.db, projectId) },
  reorderProjects: {
    schema: z.tuple([z.array(id)]),
    handler: (ctx, [orderedIds]) => reorderProjects(ctx.db, orderedIds),
  },
  listOpenProjectsForClient: {
    schema: z.tuple([id]),
    handler: (ctx, [clientId]) => listOpenProjectsForClient(ctx.db, clientId),
  },

  // --- Ausgaben / Fixkosten ---
  listExpenses: { schema: z.tuple([]), handler: (ctx) => listExpenses(ctx.db) },
  saveExpense: {
    schema: z.tuple([z.record(z.string(), z.unknown()), optionalId]),
    handler: (ctx, [input, expenseId]) => {
      if (expenseId != null) {
        updateExpense(ctx.db, expenseId, input as any)
        return expenseId
      }
      return createExpense(ctx.db, input as any)
    },
  },
  deleteExpense: { schema: z.tuple([id]), handler: (ctx, [expenseId]) => deleteExpense(ctx.db, expenseId) },
  setExpensePaid: {
    schema: z.tuple([id, z.string().nullable()]),
    handler: (ctx, [expenseId, paidAt]) => setExpensePaid(ctx.db, expenseId, paidAt),
  },
  listFixedCosts: { schema: z.tuple([]), handler: (ctx) => listFixedCosts(ctx.db) },
  saveFixedCost: {
    schema: z.tuple([z.record(z.string(), z.unknown()), optionalId]),
    handler: (ctx, [input, costId]) => {
      if (costId != null) {
        updateFixedCost(ctx.db, costId, input as any)
        return costId
      }
      return createFixedCost(ctx.db, input as any)
    },
  },
  deleteFixedCost: {
    schema: z.tuple([id]),
    handler: (ctx, [costId]) => deleteFixedCost(ctx.db, costId),
  },

  // --- Angebote ---
  listOffers: { schema: z.tuple([]), handler: (ctx) => listOffers(ctx.db) },
  getOffer: { schema: z.tuple([id]), handler: (ctx, [offerId]) => getOffer(ctx.db, offerId) },
  saveOffer: {
    schema: z.tuple([z.record(z.string(), z.unknown()), optionalId]),
    handler: (ctx, [input, offerId]) => {
      if (offerId != null) {
        updateOffer(ctx.db, offerId, input as any)
        return offerId
      }
      return createOffer(ctx.db, input as any)
    },
  },
  setOfferStatus: {
    schema: z.tuple([id, OFFER_STATUS]),
    handler: (ctx, [offerId, status]) => setOfferStatus(ctx.db, offerId, status as OfferStatus),
  },
  deleteOffer: { schema: z.tuple([id]), handler: (ctx, [offerId]) => deleteOffer(ctx.db, offerId) },
  renderOfferPreview: {
    schema: z.tuple([z.record(z.string(), z.unknown())]),
    handler: (ctx, [input]) => offerPreviewHtml(ops(ctx), input as any),
  },
  prevalidateOffer: {
    schema: z.tuple([z.record(z.string(), z.unknown())]),
    handler: (_ctx, [input]) => {
      const errors = validateOffer(input as any)
      return { ok: errors.length === 0, errors }
    },
  },
  finalizeOfferPdf: {
    schema: z.tuple([id]),
    handler: (ctx, [offerId]) => finalizeOfferWithPdf(ops(ctx), offerId),
  },
  createOfferClient: {
    schema: z.tuple([id]),
    handler: (ctx, [offerId]) => {
      const { clientId, created } = ensureOfferClient(ctx.db, offerId)
      return { clientId, clientName: getClientById(ctx.db, clientId)?.name ?? '', created }
    },
  },
  convertOfferToProject: {
    schema: z.tuple([id]),
    handler: (ctx, [offerId]) => {
      const { projectId, created } = convertOfferToProject(ctx.db, offerId)
      return { projectId, projectTitle: getProjectById(ctx.db, projectId)?.title ?? '', created }
    },
  },

  // --- Vorlage ---
  getInvoiceTemplate: { schema: z.tuple([]), handler: (ctx) => getInvoiceTemplate(ctx.db) },
  saveInvoiceTemplate: {
    schema: z.tuple([z.record(z.string(), z.unknown())]),
    handler: (ctx, [template]) => saveInvoiceTemplate(ctx.db, template as any),
  },
  listTemplateFonts: {
    schema: z.tuple([]),
    handler: () => ({ google: googleFamilies, fontshare: fontshareFamilies }),
  },
  downloadTemplateFont: {
    schema: z.tuple([z.string().min(1), z.enum(['local', 'google', 'fontshare'])]),
    handler: async (ctx, [family, source]) => {
      const fontFiles = await downloadFont(family, source, ctx.dataDir)
      return { family, source, fontFiles }
    },
  },
  renderTemplatePreview: {
    schema: z.tuple([z.record(z.string(), z.unknown())]),
    handler: (ctx, [template]) => templatePreviewHtml(ops(ctx), template as any),
  },

  // --- Bank (nur Kontoauszug-Import + Abgleich) ---
  bankListTransactions: {
    schema: z.tuple([
      z
        .record(z.string(), z.unknown())
        .nullish()
        .transform((value) => value ?? undefined),
    ]),
    handler: (ctx, [filter]) => listTransactions(ctx.db, filter as any),
  },
  bankApplyMatch: {
    schema: z.tuple([z.string().min(1), z.record(z.string(), z.unknown())]),
    handler: (ctx, [txId, choice]) => applyBankMatch(ctx.db, txId, choice as BankMatchChoice),
  },
  bankIgnore: {
    schema: z.tuple([z.string().min(1)]),
    handler: (ctx, [txId]) => {
      setTransactionMatch(ctx.db, txId, { status: 'ignored' } as any)
    },
  },

  listTodos: {
    schema: z.tuple([]),
    handler: (ctx) => listTodos(ctx.db),
  },
  createTodo: {
    schema: z.tuple([z.object({ title: z.string().trim().min(1), categoryId: id, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish() })]),
    handler: (ctx, [input]) => createTodo(ctx.db, input),
  },
  setTodoDone: {
    schema: z.tuple([id, z.boolean()]),
    handler: (ctx, [todoId, done]) => setTodoDone(ctx.db, todoId, done),
  },
  moveTodoToDate: {
    schema: z.tuple([id, z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
    handler: (ctx, [todoId, date]) => moveTodoToDate(ctx.db, todoId, date),
  },
  todoStats: {
    schema: z.tuple([]),
    handler: (ctx) => listTodoStats(ctx.db),
  },
  renameTodo: {
    schema: z.tuple([id, z.string().trim().min(1)]),
    handler: (ctx, [todoId, title]) => renameTodo(ctx.db, todoId, title),
  },
  deleteTodo: {
    schema: z.tuple([id]),
    handler: (ctx, [todoId]) => deleteTodo(ctx.db, todoId),
  },
  clearTodoCategory: {
    schema: z.tuple([id]),
    handler: (ctx, [categoryId]) => clearTodoCategory(ctx.db, categoryId),
  },
  setTodoNotes: {
    schema: z.tuple([id, z.string().max(2000).nullable()]),
    handler: (ctx, [todoId, notes]) => setTodoNotes(ctx.db, todoId, notes),
  },
  moveTodo: {
    schema: z.tuple([id, z.number().int()]),
    handler: (ctx, [todoId, delta]) => moveTodo(ctx.db, todoId, delta),
  },
  listTodoCategories: {
    schema: z.tuple([]),
    handler: (ctx) => listTodoCategories(ctx.db),
  },
  createTodoCategory: {
    schema: z.tuple([
      z.object({
        name: z.string().trim().min(1),
        resetRule: z.enum(['none', 'daily', 'weekly', 'monthly']),
        resetDay: z.number().int().min(0).max(28).nullish(),
        group: z.enum(['planner', 'regular', 'list']).optional(),
      }),
    ]),
    handler: (ctx, [input]) => createTodoCategory(ctx.db, input),
  },
  setCategoryReset: {
    schema: z.tuple([id, z.enum(['none', 'daily', 'weekly', 'monthly']), z.number().int().min(0).max(28).nullish()]),
    handler: (ctx, [categoryId, rule, day]) => setCategoryReset(ctx.db, categoryId, rule, day ?? null),
  },
  deleteTodoCategory: {
    schema: z.tuple([id]),
    handler: (ctx, [categoryId]) => deleteTodoCategory(ctx.db, categoryId),
  },
  moveTodoCategory: {
    schema: z.tuple([id, z.number().int()]),
    handler: (ctx, [categoryId, delta]) => moveTodoCategory(ctx.db, categoryId, delta),
  },
}

/** Uploads laufen als multipart, nicht über RPC. */
export async function importExpenseUpload(
  ctx: RpcContext,
  bytes: Uint8Array,
  filename: string
): Promise<unknown> {
  return importExpensePdfBytes(ops(ctx), bytes, filename)
}

export async function importStatementUpload(
  ctx: RpcContext,
  bytes: Uint8Array,
  filename: string
): Promise<unknown> {
  return importStatement(ctx.db, bytes, filename, ctx.dataDir)
}
