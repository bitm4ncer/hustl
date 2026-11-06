import type { Project, Invoice, ForecastPoint, ForecastResult } from './types'
import { round2 } from './money'

const ms = (isoDate: string): number => new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).getTime()

/**
 * Cumulative income curve over the current calendar year, day-accurate.
 *
 * - Solid ("Ist"): realized revenue (accrual, by invoice date) accumulated from
 *   1 Jan up to today. Each invoice steps the curve up on its own date.
 * - Dashed ("Prognose"): starts at today's realized total ("on top") and adds
 *   open project pipeline at each project's end date, out to 31 Dec. Overdue
 *   pipeline (end date already passed) surfaces today; undated pipeline is
 *   reported separately and never enters the curve.
 */
export function forecast(
  input: { projects: Project[]; invoices: Invoice[] },
  nowDate: string, // 'YYYY-MM-DD'
): ForecastResult {
  const { projects, invoices } = input
  const now = nowDate.slice(0, 10)
  const year = now.slice(0, 4)
  const yearStart = `${year}-01-01`
  const yearEnd = `${year}-12-31`

  // Already-invoiced amount per project, to net off the open pipeline value.
  const invoicedByProject = new Map<number, number>()
  for (const i of invoices) {
    if (i.status === 'cancelled') continue
    for (const it of i.items) {
      if (it.projectId == null) continue
      invoicedByProject.set(it.projectId, (invoicedByProject.get(it.projectId) ?? 0) + it.amount)
    }
  }

  // Realized revenue (accrual, by invoice date) within the year, up to today.
  const realizedByDate = new Map<string, number>()
  for (const i of invoices) {
    if (i.status === 'draft' || i.status === 'cancelled') continue
    const d = i.date.slice(0, 10)
    if (d < yearStart || d > now) continue
    const amountEur = i.subtotal * (i.exchangeRate > 0 ? i.exchangeRate : 1)
    realizedByDate.set(d, round2((realizedByDate.get(d) ?? 0) + amountEur))
  }

  // Open pipeline, billed at project completion. Overdue -> today; undated -> aside.
  // Track per-date contributors so the chart can name them on hover.
  const forecastByDate = new Map<string, number>()
  const projectsByDate = new Map<string, { title: string; amount: number }[]>()
  let undatedPipeline = 0
  for (const p of projects) {
    if (p.status === 'Done' || p.status === 'Archived') continue
    const open = Math.max(0, round2(p.finalPrice - (invoicedByProject.get(p.id) ?? 0)))
    if (open <= 0) continue
    if (!p.timeframeStart) {
      undatedPipeline = round2(undatedPipeline + open)
      continue
    }
    const end = (p.timeframeEnd ?? p.timeframeStart).slice(0, 10)
    const target = end < now ? now : end
    if (target > yearEnd) continue
    forecastByDate.set(target, round2((forecastByDate.get(target) ?? 0) + open))
    const arr = projectsByDate.get(target) ?? []
    arr.push({ title: p.title || '—', amount: open })
    projectsByDate.set(target, arr)
  }

  // Strictly-increasing x: coincident dates (e.g. overdue landing on "today")
  // are nudged by 1 ms so the line never has a degenerate vertical segment.
  const points: ForecastPoint[] = []
  const push = (
    t: number,
    actual: number | null,
    fc: number | null,
    contributors?: { title: string; amount: number }[],
  ): void => {
    const prev = points[points.length - 1]
    points.push({ t: prev && t <= prev.t ? prev.t + 1 : t, actual, forecast: fc, projects: contributors })
  }

  // Solid line: cumulative realized from year start to today.
  push(ms(yearStart), 0, null)
  let cum = 0
  for (const d of [...realizedByDate.keys()].sort()) {
    cum = round2(cum + realizedByDate.get(d)!)
    push(ms(d), cum, null)
  }
  const actualTotal = cum

  // Connection point ("on top"): solid ends and dashed begins at the same value.
  push(ms(now), actualTotal, actualTotal)

  // Dashed line: pipeline accumulated on top of the realized total, to year end.
  let fcum = actualTotal
  for (const d of [...forecastByDate.keys()].sort()) {
    fcum = round2(fcum + forecastByDate.get(d)!)
    push(ms(d), null, fcum, projectsByDate.get(d))
  }
  push(ms(yearEnd), null, fcum)

  return { points, undatedPipeline }
}
