import { describe, it, expect } from 'vitest'
import { RPC } from '../../src/server/rpc/registry'

const EXPECTED = [
  'listClients', 'saveClient', 'listInvoices', 'getInvoice', 'createDraft', 'updateDraft',
  'finalizeInvoice', 'cancelAndCopyInvoice', 'regenerateInvoicePdf', 'setInvoiceStatus',
  'setInvoicePaid', 'renderInvoicePreview', 'prevalidateEInvoice', 'getSettings', 'saveSettings',
  'getNumberSequence', 'setNumberSequence', 'listProjects', 'getProject', 'saveProject',
  'setProjectStatus', 'deleteProject', 'reorderProjects', 'listOpenProjectsForClient',
  'listExpenses', 'saveExpense', 'deleteExpense', 'setExpensePaid', 'listFixedCosts',
  'saveFixedCost', 'deleteFixedCost', 'getInvoiceTemplate', 'saveInvoiceTemplate',
  'listTemplateFonts', 'downloadTemplateFont', 'renderTemplatePreview',
  'bankListTransactions', 'bankApplyMatch', 'bankIgnore', 'listOffers', 'getOffer', 'saveOffer',
  'setOfferStatus', 'deleteOffer', 'renderOfferPreview', 'prevalidateOffer', 'finalizeOfferPdf',
  'createOfferClient', 'convertOfferToProject',
  'listTodos', 'createTodo', 'setTodoDone', 'renameTodo', 'deleteTodo',
  'listTodoCategories', 'createTodoCategory', 'deleteTodoCategory', 'moveTodoCategory', 'setCategoryReset',
  'moveTodoToDate', 'todoStats', 'clearTodoCategory', 'setTodoNotes', 'moveTodo'
].sort()

const REMOVED = [
  'prepareInvoiceEmail', 'sendInvoiceEmail', 'prepareOfferEmail', 'sendOfferEmail',
  'importThunderbirdSmtp', 'testSmtpConnection', 'setSmtpPassword', 'hasSmtpPassword',
  'clearSmtpPassword', 'connectBank', 'bankStatus', 'disconnectBank', 'syncBank', 'runImport',
  'openPdf', 'pickExpensePdf', 'pickTemplateLogo',
  // exportFinanceMonth ist eine HTTP-Download-Route (Spec §8.2), kein RPC.
  'exportFinanceMonth'
]

describe('rpc registry', () => {
  it('enthaelt genau die v1-Methoden', () => {
    expect(Object.keys(RPC).sort()).toEqual(EXPECTED)
  })

  it('enthaelt keine entfernten Methoden', () => {
    for (const method of REMOVED) expect(RPC[method]).toBeUndefined()
  })

  it('jede Methode hat ein Schema', () => {
    for (const [name, entry] of Object.entries(RPC)) expect(entry.schema, name).toBeDefined()
  })
})
