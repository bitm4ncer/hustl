import type { DatabaseSync } from 'node:sqlite'
import type { Project, ProjectItem, ProjectStatus } from '@shared/types'
import { projectHours } from '@shared/project-hours'
import { tx } from './tx'

export interface ProjectItemInput {
  title: string
  description: string
  hours: number | null
}

// The writable fields of a project. Notably NOT the derived clientName,
// hourlyRate or finalPrice, which are computed on read via the clients join.
export interface ProjectInput {
  notionId: string | null
  clientId: number | null
  title: string
  description: string
  status: ProjectStatus
  hours: number | null
  fixPrice: number | null
  timeframeStart: string | null
  timeframeEnd: string | null
  note: string
  items: ProjectItemInput[]
}

// Every list/get selects projects LEFT JOIN clients so we can derive the
// client name and hourly rate (and from them, finalPrice) in one query.
const SELECT_PROJECT = `
  SELECT p.*, c.name AS client_name, c.hourly_rate AS hourly_rate
  FROM projects p
  LEFT JOIN clients c ON c.id = p.client_id
`

function rowToItem(r: any): ProjectItem {
  return {
    id: r.id,
    projectId: r.project_id,
    position: r.position,
    title: r.title ?? '',
    description: r.description ?? '',
    hours: r.hours
  }
}

function rowToProject(r: any, items: ProjectItem[]): Project {
  const hourlyRate = r.hourly_rate ?? 0
  // Leeres Stundenfeld: die Positions-Stunden rechnen mit, sonst stünde ein
  // Projekt mit gepflegten Positionen auf 0 €.
  const hours = projectHours({ hours: r.hours, items })
  const finalPrice = r.fix_price != null ? r.fix_price : (hours ?? 0) * hourlyRate
  return {
    id: r.id,
    notionId: r.notion_id,
    clientId: r.client_id,
    clientName: r.client_name ?? '',
    title: r.title,
    description: r.description ?? '',
    status: r.status as ProjectStatus,
    hours: r.hours,
    fixPrice: r.fix_price,
    hourlyRate,
    finalPrice,
    timeframeStart: r.timeframe_start,
    timeframeEnd: r.timeframe_end,
    note: r.note ?? '',
    items
  }
}

/** All project_items grouped by project id — one query for the whole list. */
function loadAllItems(db: DatabaseSync): Map<number, ProjectItem[]> {
  const map = new Map<number, ProjectItem[]>()
  const rows = db.prepare('SELECT * FROM project_items ORDER BY project_id, position').all() as any[]
  for (const r of rows) {
    const item = rowToItem(r)
    const list = map.get(item.projectId)
    if (list) list.push(item)
    else map.set(item.projectId, [item])
  }
  return map
}

function loadItems(db: DatabaseSync, projectId: number): ProjectItem[] {
  return (
    db.prepare('SELECT * FROM project_items WHERE project_id = ? ORDER BY position').all(projectId) as any[]
  ).map(rowToItem)
}

/** Replace a project's items with the given list (delete + reinsert). Callers
 *  wrap this in a transaction together with the project row itself. */
function writeItems(db: DatabaseSync, projectId: number, items: ProjectItemInput[]): void {
  db.prepare('DELETE FROM project_items WHERE project_id = ?').run(projectId)
  const ins = db.prepare(
    'INSERT INTO project_items (project_id, position, title, description, hours) VALUES (?, ?, ?, ?, ?)'
  )
  items.forEach((it, idx) => ins.run(projectId, idx, it.title, it.description, it.hours))
}

export function listProjects(db: DatabaseSync): Project[] {
  const items = loadAllItems(db)
  return (
    db
      .prepare(`${SELECT_PROJECT} ORDER BY p.sort_order IS NULL, p.sort_order ASC, p.id DESC`)
      .all() as any[]
  ).map((r) => rowToProject(r, items.get(r.id) ?? []))
}

/** Persist a manual order for the given project ids: they keep the same set of
 *  sort_order "slots" they occupied, just redistributed in the new order — so a
 *  reorder within a filtered view never disturbs the non-visible projects. */
export function reorderProjects(db: DatabaseSync, orderedIds: number[]): void {
  tx(db, () => {
    const slots = orderedIds
      .map((id) => (db.prepare('SELECT sort_order FROM projects WHERE id = ?').get(id) as
        | { sort_order: number | null }
        | undefined)?.sort_order)
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b)
    // Fall back to a plain sequence if any slot was missing (shouldn't happen).
    const values = slots.length === orderedIds.length ? slots : orderedIds.map((_, i) => i)
    const upd = db.prepare("UPDATE projects SET sort_order = ?, updated_at = datetime('now') WHERE id = ?")
    orderedIds.forEach((id, i) => upd.run(values[i], id))
  })
}

export function getProjectById(db: DatabaseSync, id: number): Project | null {
  const r = db.prepare(`${SELECT_PROJECT} WHERE p.id = ?`).get(id) as any
  return r ? rowToProject(r, loadItems(db, r.id)) : null
}

export function listOpenProjectsForClient(db: DatabaseSync, clientId: number): Project[] {
  return (
    db
      .prepare(
        `${SELECT_PROJECT}
         WHERE p.client_id = ? AND p.status NOT IN ('Done', 'Archived')
         ORDER BY COALESCE(p.timeframe_start, '') DESC, p.id DESC`
      )
      .all(clientId) as any[]
  ).map((r) => rowToProject(r, loadItems(db, r.id)))
}

export function createProject(db: DatabaseSync, input: ProjectInput): number {
  return tx(db, () => {
    const info = db
      .prepare(
        `
      INSERT INTO projects
        (notion_id, client_id, title, description, status, hours, fix_price, timeframe_start, timeframe_end, note, sort_order)
      VALUES
        (@notionId, @clientId, @title, @description, @status, @hours, @fixPrice, @timeframeStart, @timeframeEnd, @note,
         (SELECT COALESCE(MIN(sort_order), 0) - 1 FROM projects))
    `
      )
      .run({
        notionId: input.notionId,
        clientId: input.clientId,
        title: input.title,
        description: input.description,
        status: input.status,
        hours: input.hours,
        fixPrice: input.fixPrice,
        timeframeStart: input.timeframeStart,
        timeframeEnd: input.timeframeEnd,
        note: input.note
      })
    const id = Number(info.lastInsertRowid)
    writeItems(db, id, input.items)
    return id
  })
}

export function updateProject(db: DatabaseSync, id: number, input: ProjectInput): void {
  // node:sqlite rejects bind keys not referenced in the SQL, so we pass an
  // explicit object (notably WITHOUT notionId, which this UPDATE never touches)
  // rather than spreading the whole ProjectInput.
  tx(db, () => {
    db.prepare(
      `
      UPDATE projects SET
        client_id=@clientId, title=@title, description=@description, status=@status,
        hours=@hours, fix_price=@fixPrice, timeframe_start=@timeframeStart,
        timeframe_end=@timeframeEnd, note=@note, updated_at=datetime('now')
      WHERE id=@id
    `
    ).run({
      id,
      clientId: input.clientId,
      title: input.title,
      description: input.description,
      status: input.status,
      hours: input.hours,
      fixPrice: input.fixPrice,
      timeframeStart: input.timeframeStart,
      timeframeEnd: input.timeframeEnd,
      note: input.note
    })
    writeItems(db, id, input.items)
  })
}

export function setProjectStatus(db: DatabaseSync, id: number, status: ProjectStatus): void {
  db.prepare("UPDATE projects SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
    status,
    id
  )
}

/**
 * Hard-delete a project. `invoice_items.project_id` carries no FK constraint, so
 * any already-billed items simply keep a now-dangling reference (harmless — the
 * forecast just stops attributing to the gone project).
 */
export function deleteProject(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}

/** Notion import writes only the flat project fields — it never touches the
 *  positions list, so manual Positionen survive re-imports. */
export function upsertProjectByNotionId(db: DatabaseSync, input: Omit<ProjectInput, 'items'>): void {
  db.prepare(
    `
    INSERT INTO projects
      (notion_id, client_id, title, description, status, hours, fix_price, timeframe_start, timeframe_end, note, sort_order)
    VALUES
      (@notionId, @clientId, @title, @description, @status, @hours, @fixPrice, @timeframeStart, @timeframeEnd, @note,
       (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM projects))
    ON CONFLICT(notion_id) DO UPDATE SET
      client_id=@clientId, title=@title, description=@description, status=@status,
      hours=@hours, fix_price=@fixPrice, timeframe_start=@timeframeStart,
      timeframe_end=@timeframeEnd, note=@note, updated_at=datetime('now')
  `
  ).run({
    notionId: input.notionId,
    clientId: input.clientId,
    title: input.title,
    description: input.description,
    status: input.status,
    hours: input.hours,
    fixPrice: input.fixPrice,
    timeframeStart: input.timeframeStart,
    timeframeEnd: input.timeframeEnd,
    note: input.note
  })
}
