import { describe, it, expect } from 'vitest'
import { forecast } from '@shared/forecast'
import type { Project, Invoice } from '@shared/types'

const proj = (over: Partial<Project>): Project => ({
  id: 1, notionId: null, clientId: 1, clientName: 'C', title: 'P', description: '',
  status: 'Active', hours: null, fixPrice: 6000, hourlyRate: 0, finalPrice: 6000,
  timeframeStart: '2026-07-01', timeframeEnd: '2026-09-30', note: '',
  ...over,
})

const inv = (over: Partial<Invoice>): Invoice => ({
  id: 1, number: '2026001', clientId: 1, date: '2026-06-10',
  servicePeriodStart: null, servicePeriodEnd: null, status: 'sent',
  subtotal: 1000, taxRate: 0.19, taxAmount: 190, total: 1190,
  noTax: false, reverseCharge: false, poNumber: null, notes: null,
  pdfPath: null, hash: null, prevHash: null, finalizedAt: null, paidAt: null, items: [],
  ...over,
})

// The single point where solid meets dashed: actual and forecast both set.
const connection = (r: ReturnType<typeof forecast>): { actual: number | null; forecast: number | null } =>
  r.points.find((p) => p.actual != null && p.forecast != null)!
const lastForecast = (r: ReturnType<typeof forecast>): number | null =>
  r.points[r.points.length - 1].forecast

describe('forecast (cumulative, day-accurate)', () => {
  it('accumulates realized revenue by invoice date, up to today', () => {
    const r = forecast(
      { projects: [], invoices: [inv({ date: '2026-02-10', subtotal: 1000 }), inv({ date: '2026-05-20', subtotal: 500 })] },
      '2026-06-15',
    )
    // The dashed line starts on top of the realized total (no pipeline here).
    expect(connection(r).actual).toBe(1500)
    expect(connection(r).forecast).toBe(1500)
    expect(lastForecast(r)).toBe(1500)
  })

  it('ignores invoices dated after today and draft/cancelled ones', () => {
    const r = forecast(
      { projects: [], invoices: [
        inv({ date: '2026-02-10', subtotal: 1000 }),
        inv({ date: '2026-09-01', subtotal: 999 }), // future -> not realized yet
        inv({ date: '2026-03-01', subtotal: 888, status: 'draft' }),
      ] },
      '2026-06-15',
    )
    expect(connection(r).actual).toBe(1000)
  })

  it('adds open pipeline on top of the realized total, ending at year end', () => {
    const r = forecast({ projects: [proj({})], invoices: [] }, '2026-06-15')
    expect(connection(r).actual).toBe(0)
    expect(lastForecast(r)).toBe(6000) // 0 realized + 6000 pipeline
  })

  it('subtracts already-invoiced amounts (by projectId) from the open value', () => {
    const r = forecast(
      { projects: [proj({})],
        invoices: [inv({ date: '2026-06-01', subtotal: 3000, items: [{ id: 1, invoiceId: 1, notionTaskId: null, projectId: 1,
          position: 0, title: 'x', description: '', quantity: null, unitPrice: null, fixPrice: 3000, amount: 3000 }] })] },
      '2026-06-15',
    )
    expect(connection(r).actual).toBe(3000) // realized
    expect(lastForecast(r)).toBe(6000) // 3000 realized + (6000-3000) open pipeline
  })

  it('surfaces overdue (past end date) open value at today', () => {
    const r = forecast(
      { projects: [proj({ timeframeStart: '2026-03-01', timeframeEnd: '2026-04-30' })], invoices: [] },
      '2026-06-15',
    )
    // No realized; overdue pipeline lands on the curve as soon as today.
    expect(connection(r).actual).toBe(0)
    expect(lastForecast(r)).toBe(6000)
    const firstRise = r.points.find((p) => p.forecast != null && p.forecast > 0)!
    expect(firstRise.t).toBeGreaterThanOrEqual(new Date('2026-06-15T00:00:00Z').getTime())
    expect(firstRise.t).toBeLessThan(new Date('2026-06-16T00:00:00Z').getTime())
  })

  it('puts undated open projects into undatedPipeline, not the curve', () => {
    const r = forecast({ projects: [proj({ timeframeStart: null, timeframeEnd: null })], invoices: [] }, '2026-06-15')
    expect(r.undatedPipeline).toBe(6000)
    expect(lastForecast(r)).toBe(0)
  })

  it('skips Done/Archived projects', () => {
    const r = forecast({ projects: [proj({ status: 'Done' })], invoices: [] }, '2026-06-15')
    expect(r.undatedPipeline).toBe(0)
    expect(lastForecast(r)).toBe(0)
  })
})
