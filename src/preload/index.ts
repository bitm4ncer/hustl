import { contextBridge, ipcRenderer } from 'electron'
import { CH } from '../main/ipc/channels'
import type { HustlApi } from '../main/ipc/channels'

const api: HustlApi = {
  listClients: () => ipcRenderer.invoke(CH.listClients),
  saveClient: (input, id) => ipcRenderer.invoke(CH.saveClient, input, id),
  listInvoices: () => ipcRenderer.invoke(CH.listInvoices),
  getInvoice: (id) => ipcRenderer.invoke(CH.getInvoice, id),
  createDraft: (input) => ipcRenderer.invoke(CH.createDraft, input),
  updateDraft: (id, input) => ipcRenderer.invoke(CH.updateDraft, id, input),
  finalizeInvoice: (id) => ipcRenderer.invoke(CH.finalizeInvoice, id),
  cancelAndCopyInvoice: (id) => ipcRenderer.invoke(CH.cancelAndCopyInvoice, id),
  regenerateInvoicePdf: (id) => ipcRenderer.invoke(CH.regenerateInvoicePdf, id),
  setInvoiceStatus: (id, status) => ipcRenderer.invoke(CH.setInvoiceStatus, id, status),
  renderInvoicePreview: (input) => ipcRenderer.invoke(CH.renderInvoicePreview, input),
  prevalidateEInvoice: (input) => ipcRenderer.invoke(CH.prevalidateEInvoice, input),
  getSettings: () => ipcRenderer.invoke(CH.getSettings),
  saveSettings: (s) => ipcRenderer.invoke(CH.saveSettings, s),
  getNumberSequence: (year) => ipcRenderer.invoke(CH.getNumberSequence, year),
  setNumberSequence: (year, lastNumber) =>
    ipcRenderer.invoke(CH.setNumberSequence, year, lastNumber),
  listProjects: () => ipcRenderer.invoke(CH.listProjects),
  getProject: (id) => ipcRenderer.invoke(CH.getProject, id),
  saveProject: (input, id) => ipcRenderer.invoke(CH.saveProject, input, id),
  setProjectStatus: (id, status) => ipcRenderer.invoke(CH.setProjectStatus, id, status),
  deleteProject: (id) => ipcRenderer.invoke(CH.deleteProject, id),
  reorderProjects: (ids) => ipcRenderer.invoke(CH.reorderProjects, ids),
  listOpenProjectsForClient: (clientId) =>
    ipcRenderer.invoke(CH.listOpenProjectsForClient, clientId),
  listExpenses: () => ipcRenderer.invoke(CH.listExpenses),
  saveExpense: (input, id) => ipcRenderer.invoke(CH.saveExpense, input, id),
  deleteExpense: (id) => ipcRenderer.invoke(CH.deleteExpense, id),
  listTodos: () => ipcRenderer.invoke(CH.listTodos),
  createTodo: (input) => ipcRenderer.invoke(CH.createTodo, input),
  setTodoDone: (id, done) => ipcRenderer.invoke(CH.setTodoDone, id, done),
  renameTodo: (id, title) => ipcRenderer.invoke(CH.renameTodo, id, title),
  deleteTodo: (id) => ipcRenderer.invoke(CH.deleteTodo, id),
  clearTodoCategory: (id) => ipcRenderer.invoke(CH.clearTodoCategory, id),
  setTodoNotes: (id, notes) => ipcRenderer.invoke(CH.setTodoNotes, id, notes),
  moveTodo: (id, delta) => ipcRenderer.invoke(CH.moveTodo, id, delta),
  listTodoCategories: () => ipcRenderer.invoke(CH.listTodoCategories),
  createTodoCategory: (input) => ipcRenderer.invoke(CH.createTodoCategory, input),
  deleteTodoCategory: (id) => ipcRenderer.invoke(CH.deleteTodoCategory, id),
  moveTodoCategory: (id, delta) => ipcRenderer.invoke(CH.moveTodoCategory, id, delta),
  setCategoryReset: (id, rule, day) => ipcRenderer.invoke(CH.setCategoryReset, id, rule, day),
  moveTodoToDate: (id, date) => ipcRenderer.invoke(CH.moveTodoToDate, id, date),
  todoStats: () => ipcRenderer.invoke(CH.todoStats),
  setExpensePaid: (id, paidAt) => ipcRenderer.invoke(CH.setExpensePaid, id, paidAt),
  importExpensePdf: (bytes, filename) => ipcRenderer.invoke(CH.importExpensePdf, bytes, filename),
  listFixedCosts: () => ipcRenderer.invoke(CH.listFixedCosts),
  saveFixedCost: (input, id) => ipcRenderer.invoke(CH.saveFixedCost, input, id),
  deleteFixedCost: (id) => ipcRenderer.invoke(CH.deleteFixedCost, id),
  setInvoicePaid: (id, paid) => ipcRenderer.invoke(CH.setInvoicePaid, id, paid),
  exportFinanceMonth: (yearMonth) => ipcRenderer.invoke(CH.exportFinanceMonth, yearMonth),
  getInvoiceTemplate: () => ipcRenderer.invoke(CH.getInvoiceTemplate),
  saveInvoiceTemplate: (t) => ipcRenderer.invoke(CH.saveInvoiceTemplate, t),
  listTemplateFonts: () => ipcRenderer.invoke(CH.listTemplateFonts),
  downloadTemplateFont: (family, source) => ipcRenderer.invoke(CH.downloadTemplateFont, family, source),
  renderTemplatePreview: (template) => ipcRenderer.invoke(CH.renderTemplatePreview, template),
  bankListTransactions: (filter) => ipcRenderer.invoke(CH.bankListTransactions, filter),
  bankApplyMatch: (txId, choice) => ipcRenderer.invoke(CH.bankApplyMatch, txId, choice),
  bankIgnore: (txId) => ipcRenderer.invoke(CH.bankIgnore, txId),
  importBankStatement: (bytes, filename) => ipcRenderer.invoke(CH.importBankStatement, bytes, filename),
  listOffers: () => ipcRenderer.invoke(CH.listOffers),
  getOffer: (id) => ipcRenderer.invoke(CH.getOffer, id),
  saveOffer: (input, id) => ipcRenderer.invoke(CH.saveOffer, input, id),
  setOfferStatus: (id, status) => ipcRenderer.invoke(CH.setOfferStatus, id, status),
  deleteOffer: (id) => ipcRenderer.invoke(CH.deleteOffer, id),
  renderOfferPreview: (input) => ipcRenderer.invoke(CH.renderOfferPreview, input),
  prevalidateOffer: (input) => ipcRenderer.invoke(CH.prevalidateOffer, input),
  finalizeOfferPdf: (id) => ipcRenderer.invoke(CH.finalizeOfferPdf, id),
  createOfferClient: (id) => ipcRenderer.invoke(CH.createOfferClient, id),
  convertOfferToProject: (id) => ipcRenderer.invoke(CH.convertOfferToProject, id),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('hustl', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error fallback when contextIsolation is disabled
  window.hustl = api
}
