import type { DatabaseSync } from 'node:sqlite'
import type { FixedCost, FixedCostInterval } from '@shared/types'

export interface FixedCostInput {
  name: string
  category: string
  gross: number
  vatRate: number
  interval: FixedCostInterval
  startDate: string
  endDate: string | null
  active: boolean
  note: string
}

function rowToFixedCost(r: any): FixedCost {
  return {
    id: r.id,
    name: r.name,
    category: r.category ?? '',
    gross: r.gross,
    vatRate: r.vat_rate,
    interval: r.interval as FixedCostInterval,
    startDate: r.start_date,
    endDate: r.end_date ?? null,
    active: !!r.active,
    note: r.note ?? '',
  }
}

export function listFixedCosts(db: DatabaseSync): FixedCost[] {
  return (
    db.prepare('SELECT * FROM fixed_costs ORDER BY active DESC, name ASC').all() as any[]
  ).map(rowToFixedCost)
}

export function createFixedCost(db: DatabaseSync, input: FixedCostInput): number {
  const info = db
    .prepare(
      `INSERT INTO fixed_costs (name, category, gross, vat_rate, interval, start_date, end_date, active, note)
       VALUES (@name, @category, @gross, @vatRate, @interval, @startDate, @endDate, @active, @note)`,
    )
    .run({
      name: input.name,
      category: input.category,
      gross: input.gross,
      vatRate: input.vatRate,
      interval: input.interval,
      startDate: input.startDate,
      endDate: input.endDate,
      active: input.active ? 1 : 0,
      note: input.note,
    })
  return Number(info.lastInsertRowid)
}

export function updateFixedCost(db: DatabaseSync, id: number, input: FixedCostInput): void {
  db.prepare(
    `UPDATE fixed_costs SET name=@name, category=@category, gross=@gross, vat_rate=@vatRate,
       interval=@interval, start_date=@startDate, end_date=@endDate, active=@active, note=@note,
       updated_at=datetime('now') WHERE id=@id`,
  ).run({
    id,
    name: input.name,
    category: input.category,
    gross: input.gross,
    vatRate: input.vatRate,
    interval: input.interval,
    startDate: input.startDate,
    endDate: input.endDate,
    active: input.active ? 1 : 0,
    note: input.note,
  })
}

export function deleteFixedCost(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM fixed_costs WHERE id = ?').run(id)
}
