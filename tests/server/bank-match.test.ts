import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildServer } from '../../src/server/index'
import { createSession } from '../../src/server/auth/store'

const origin = 'https://hustl.example.com'

async function setup() {
  const instance = await buildServer({
    dataDir: mkdtempSync(join(tmpdir(), 'hustl-bank-')),
    origin,
    rpId: 'hustl.example.com',
    port: 0,
    secureCookies: true,
  })
  const session = createSession(instance.db, { userAgent: null, ip: null })
  const headers = {
    origin,
    'x-hustl-client': 'web',
    cookie: `hustl_session=${session.token}`,
  }
  const rpc = async (method: string, args: unknown[]) => {
    const res = await instance.inject({
      method: 'POST',
      url: `/api/rpc/${method}`,
      payload: { args },
      headers,
    })
    return res.json() as { ok: boolean; data?: any; error?: { code: string; message: string } }
  }
  const addTx = (id: string, amount: number, kind: 'debit' | 'credit', date = '2026-11-02') =>
    instance.db
      .prepare(
        `INSERT INTO bank_transactions (id, account_id, booking_date, amount, currency, counterparty, remittance, kind, status)
         VALUES (?, 'acct', ?, ?, 'EUR', 'Test', '', ?, 'unmatched')`,
      )
      .run(id, date, amount, kind)

  return { app: instance, rpc, addTx }
}

describe('bank abgleich', () => {
  it('bestätigt eine rechnung mit der client-auswahl ohne status-feld', async () => {
    const { app, rpc, addTx } = await setup()
    const client = await rpc('saveClient', [
      {
        notionId: null,
        name: 'Kunde',
        contactPerson: '',
        addressExtra: '',
        address: '',
        street: '',
        zip: '',
        city: '',
        country: 'DE',
        email: '',
        hourlyRate: null,
        noTax: false,
        vatId: '',
        notes: '',
      },
      null,
    ])
    expect(client.ok).toBe(true)
    const invoice = await rpc('createDraft', [
      {
        clientId: client.data,
        date: '2026-11-03',
        items: [
          {
            title: 'Pos',
            description: '',
            quantity: 1,
            unitPrice: 100,
            fixPrice: null,
            projectId: null,
            subItems: [],
          },
        ],
      },
    ])
    addTx('tx-invoice', 119, 'credit')

    // Eine Rechnung muss finalisiert sein, bevor eine Zahlung sie bezahlt macht.
    app.db.prepare("UPDATE invoices SET status = 'finalized', number = '2026010' WHERE id = ?").run(invoice.data)

    const res = await rpc('bankApplyMatch', ['tx-invoice', { invoiceId: invoice.data }])
    expect(res.ok).toBe(true)

    const open = await rpc('listInvoices', [])
    expect(open.data.find((i: any) => i.id === invoice.data).status).toBe('paid')

    const txs = await rpc('bankListTransactions', [{ status: 'matched' }])
    const tx = txs.data.find((t: any) => t.id === 'tx-invoice')
    expect(tx.matchedInvoiceId).toBe(invoice.data)
    await app.close()
  })

  it('verknüpft einen beleg und korrigiert fremdwährung auf den buchungsbetrag', async () => {
    const { app, rpc, addTx } = await setup()
    const expense = await rpc('saveExpense', [
      {
        vendor: 'OpenCode',
        category: '',
        date: '2026-11-01',
        paidAt: '2026-11-01',
        gross: 37.19,
        originalAmount: 40,
        originalCurrency: 'USD',
        vatRate: 19,
        note: '',
        pdfPath: null,
        sourceName: null,
      },
      null,
    ])
    addTx('tx-expense', -40.5, 'debit', '2026-11-02')

    const res = await rpc('bankApplyMatch', ['tx-expense', { expenseId: expense.data }])
    expect(res.ok).toBe(true)

    const expenses = await rpc('listExpenses', [])
    const saved = expenses.data.find((e: any) => e.id === expense.data)
    expect(saved.gross).toBe(40.5)
    expect(saved.paidAt).toBe('2026-11-02')
    await app.close()
  })

  it('verknüpft fixkosten', async () => {
    const { app, rpc, addTx } = await setup()
    const fixed = await rpc('saveFixedCost', [
      {
        name: 'KSK',
        category: 'Versicherung',
        gross: 550.53,
        vatRate: 0,
        interval: 'monthly',
        startDate: '2026-01-01',
        endDate: null,
        active: true,
        note: '',
      },
      null,
    ])
    addTx('tx-fixed', -550.53, 'debit')

    const res = await rpc('bankApplyMatch', ['tx-fixed', { fixedCostId: fixed.data }])
    expect(res.ok).toBe(true)

    const txs = await rpc('bankListTransactions', [{ status: 'matched' }])
    expect(txs.data.find((t: any) => t.id === 'tx-fixed').matchedFixedCostId).toBe(fixed.data)
    await app.close()
  })

  it('legt aus der buchung einen beleg an', async () => {
    const { app, rpc, addTx } = await setup()
    addTx('tx-create', -19.86, 'debit', '2026-10-30')

    const res = await rpc('bankApplyMatch', [
      'tx-create',
      {
        createExpense: {
          vendor: 'PayPal Europe',
          gross: 19.86,
          date: '2026-10-30',
          pdfPath: 'expenses/beleg.pdf',
          sourceName: 'beleg.pdf',
        },
      },
    ])
    expect(res.ok).toBe(true)

    const expenses = await rpc('listExpenses', [])
    const created = expenses.data.find((e: any) => e.vendor === 'PayPal Europe')
    expect(created).toBeTruthy()
    expect(created.gross).toBe(19.86)
    expect(created.note).toBe('Aus Bank-Abgleich')

    const txs = await rpc('bankListTransactions', [{ status: 'matched' }])
    expect(txs.data.find((t: any) => t.id === 'tx-create').matchedExpenseId).toBe(created.id)
    await app.close()
  })

  it('ignoriert eine buchung', async () => {
    const { app, rpc, addTx } = await setup()
    addTx('tx-ignore', 0.1, 'credit')
    const res = await rpc('bankIgnore', ['tx-ignore'])
    expect(res.ok).toBe(true)

    const ignored = await rpc('bankListTransactions', [{ status: 'ignored' }])
    expect(ignored.data.map((t: any) => t.id)).toContain('tx-ignore')
    await app.close()
  })
})
