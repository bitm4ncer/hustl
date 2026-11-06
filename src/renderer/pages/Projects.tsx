import { useEffect, useRef, useState } from 'react'
import { motion, Reorder, useDragControls } from 'framer-motion'
import type { Client, Project, ProjectStatus } from '@shared/types'
import { api } from '../lib/api'
import { projectHours } from '@shared/project-hours'
import { t } from '../i18n'
import { Panel } from '../components/Panel'
import { Button } from '../components/Button'
import { SearchInput } from '../components/SearchInput'
import { Icon } from '../components/Icon'
import { Field, NumberField, SelectField, TextAreaField } from '../components/Field'
import { StatusMenu } from '../components/StatusMenu'
import { StatusSelect } from '../components/StatusSelect'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { useAutosave } from '../lib/use-autosave'
import { formatMoney, formatDate, formatNumber } from '../i18n/format'

// Eine Leistungsposition im Editor — `key` nur für React/Drag, wird vor dem
// Speichern entfernt.
interface ItemDraft {
  key: string
  title: string
  description: string
  hours: number | null
}

const newItemDraft = (): ItemDraft => ({
  key: Math.random().toString(36).slice(2),
  title: '',
  description: '',
  hours: null,
})

// Structurally identical to the main-process `ProjectInput` — kept here so the
// renderer never reaches across into `src/main`. `api.saveProject` accepts it.
type Draft = Omit<Project, 'id' | 'clientName' | 'hourlyRate' | 'finalPrice' | 'items'> & {
  items: ItemDraft[]
}

// The user-facing statuses, in the order shown in the filter row and the status
// select. `Archived` is intentionally excluded — it lives in the Archiv subpage
// instead. (Legacy `Ongoing`/`Wrap-up` were merged into `On Hold`/"Pausiert".)
const STATUSES: ProjectStatus[] = [
  'Active',
  'Forthcoming',
  'On Hold',
  'Done',
]

// Solid status colours for the StatusMenu dot — chosen to read in both themes.
const statusColor: Record<ProjectStatus, string> = {
  Active: '#ff7f54',
  Forthcoming: '#7088ba',
  'On Hold': '#9a9a9d',
  Done: '#4caf72',
  Archived: '#b06a6a',
}

// The seven non-archived statuses as StatusMenu options (labels follow the UI language).
function emptyDraft(): Draft {
  return {
    notionId: null,
    clientId: null,
    title: '',
    description: '',
    status: 'Active',
    hours: null,
    fixPrice: null,
    timeframeStart: null,
    timeframeEnd: null,
    note: '',
    items: [],
  }
}

const fmtHours = (n: number): string => formatNumber(n)

/** Eine Positions-Karte im Projekt-Editor: Griff zum Sortieren, Titel,
 *  Beschreibung, optionale Stunden, Entfernen. */
function PositionCard({
  item,
  onChange,
  onRemove,
}: {
  item: ItemDraft
  onChange: (p: Partial<ItemDraft>) => void
  onRemove: () => void
}): React.ReactElement {
  const controls = useDragControls()
  return (
    <Reorder.Item as="div" value={item} dragListener={false} dragControls={controls}>
      <div className="flex gap-2 rounded-[12px] p-3" style={{ background: 'var(--surface-raised)' }}>
        <span
          role="button"
          aria-label={t.project.dragHandle}
          title={t.project.dragHandle}
          onPointerDown={(e) => {
            e.stopPropagation()
            controls.start(e)
          }}
          onClick={(e) => e.stopPropagation()}
          className="mt-2 shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
          style={{ color: 'var(--text-muted)' }}
        >
          <Icon name="grip-vertical" size={16} />
        </span>
        <div className="grid flex-1 gap-2">
          <Field
            label={t.project.itemTitle}
            value={item.title}
            onChange={(v) => onChange({ title: v })}
          />
          <TextAreaField
            label={t.project.itemDescription}
            rows={2}
            value={item.description}
            onChange={(v) => onChange({ description: v })}
          />
          <div className="flex items-end justify-between gap-3">
            <div className="w-40">
              <NumberField
                label={t.project.itemHours}
                step={0.25}
                value={item.hours}
                onChange={(v) => onChange({ hours: v })}
              />
            </div>
            <button
              type="button"
              onClick={onRemove}
              className="rounded-[8px] px-2 py-1 text-xs focus:outline-none focus-visible:[box-shadow:var(--focus)]"
              style={{ color: 'var(--text-muted)' }}
            >
              {t.project.removeItem}
            </button>
          </div>
        </div>
      </div>
    </Reorder.Item>
  )
}

function timeframeLabel(p: Project): string {
  const start = p.timeframeStart ? formatDate(p.timeframeStart) : ''
  const end = p.timeframeEnd ? formatDate(p.timeframeEnd) : ''
  if (start && end) return `${start}–${end}`
  return start || end || ''
}

/** Borderless segmented pill used for the view switch and the status filter. */
function SegPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:[box-shadow:var(--focus)]"
      style={{ color: active ? 'var(--text)' : 'var(--text-muted)' }}
    >
      {active && (
        <motion.span
          layoutId="seg-active"
          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
          className="absolute inset-0 -z-10 rounded-full"
          style={{ background: 'color-mix(in srgb, var(--accent) 16%, var(--surface-raised))' }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  )
}

/** One draggable project row: a grip handle (left) starts the reorder; the rest
 *  of the card still opens the editor on click, and the action buttons keep
 *  their own click via bubble-phase stops. */
function ProjectCard({
  p,
  index,
  archiveMode,
  statusOptions,
  onOpen,
  onStatus,
  onCreateInvoice,
}: {
  p: Project
  index: number
  archiveMode: boolean
  statusOptions: { value: string; label: string; color: string }[]
  onOpen: (p: Project) => void
  onStatus: (id: number, status: ProjectStatus) => void
  onCreateInvoice: (clientId: number, projectIds: number[]) => void
}): React.ReactElement {
  const controls = useDragControls()
  const tf = timeframeLabel(p)
  return (
    <Reorder.Item as="div" value={p} dragListener={false} dragControls={controls}>
      <Panel index={index} onClick={() => onOpen(p)}>
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-4">
          <div className="flex min-w-0 items-start gap-2">
            <span
              onPointerDown={(e) => {
                e.stopPropagation()
                controls.start(e)
              }}
              onClick={(e) => e.stopPropagation()}
              title={t.project.dragHandle}
              aria-label={t.project.dragHandle}
              className="mt-0.5 flex h-6 w-5 shrink-0 cursor-grab items-center justify-center"
              style={{ color: 'var(--text-muted)', touchAction: 'none' }}
            >
              <Icon name="grip-vertical" size={16} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <StatusMenu
                  current={p.status}
                  options={statusOptions}
                  onChange={(s) => onStatus(p.id, s as ProjectStatus)}
                />
                <span className="font-medium break-words" style={{ color: 'var(--text)' }}>
                  {p.title}
                </span>
              </div>
              <div className="mt-1 truncate text-sm" style={{ color: 'var(--text-muted)' }}>
                {p.clientName || t.common.none}
                {tf && <span> · {tf}</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:shrink-0 md:gap-3">
            <span className="text-sm" style={{ color: 'var(--text)' }}>
              {formatMoney(p.finalPrice)}
            </span>
            {p.clientId != null && (
              <span onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  title={t.actions.createInvoiceFromProject}
                  aria-label={t.actions.createInvoiceFromProject}
                  onClick={() => onCreateInvoice(p.clientId as number, [p.id])}
                  className="invoice-icon-btn flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors focus:outline-none focus-visible:[box-shadow:var(--focus)]"
                  style={{ background: 'transparent', color: 'var(--accent)' }}
                >
                  <Icon name="receipt" size={18} />
                </button>
              </span>
            )}
            {!archiveMode && p.status === 'Done' && (
              <span onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  title={t.actions.archive}
                  aria-label={t.actions.archive}
                  onClick={() => onStatus(p.id, 'Archived')}
                  className="flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors hover:[background:var(--surface-raised)] focus:outline-none focus-visible:[box-shadow:var(--focus)]"
                  style={{ background: 'transparent', color: 'var(--text-muted)' }}
                >
                  <Icon name="archive" size={18} />
                </button>
              </span>
            )}
          </div>
        </div>
      </Panel>
    </Reorder.Item>
  )
}

export function Projects({
  onCreateInvoice,
}: {
  onCreateInvoice: (clientId: number, projectIds: number[]) => void
}): React.ReactElement {
  const statusOptions = STATUSES.map((s) => ({
    value: s,
    label: t.project.status[s],
    color: statusColor[s],
  }))
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ProjectStatus | 'all'>('Active')
  const [archiveMode, setArchiveMode] = useState(false)
  const [editing, setEditing] = useState<{ id?: number; draft: Draft } | null>(null)
  const [saving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = (): void => {
    void api.listProjects().then(setProjects)
    void api.listClients().then(setClients)
  }
  useEffect(load, [])

  const startNew = (): void => {
    setConfirmDelete(false)
    setEditing({ draft: emptyDraft() })
  }
  const startEdit = (p: Project): void => {
    setConfirmDelete(false)
    setEditing({
      id: p.id,
      draft: {
        notionId: p.notionId,
        clientId: p.clientId,
        title: p.title,
        description: p.description,
        status: p.status,
        hours: p.hours,
        fixPrice: p.fixPrice,
        timeframeStart: p.timeframeStart,
        timeframeEnd: p.timeframeEnd,
        note: p.note,
        items: p.items.map((it) => ({
          key: `db-${it.id}`,
          title: it.title,
          description: it.description,
          hours: it.hours,
        })),
      },
    })
  }

  const editingRef = useRef(editing)
  editingRef.current = editing

  const toInput = (draft: Draft): Parameters<typeof api.saveProject>[0] => ({
    ...draft,
    items: draft.items.map(({ title, description, hours }) => ({ title, description, hours })),
  })

  const autosave = useAutosave({
    value: editing?.draft ?? null,
    enabled: editing != null,
    delay: 600,
    save: async (draft) => {
      const current = editingRef.current
      if (!current || !draft) return
      // Ein neuer Eintrag ohne Titel würde als leerer Datensatz landen.
      if (current.id == null && draft.title.trim() === '') return
      const id = await api.saveProject(toInput(draft), current.id)
      if (current.id == null) {
        setEditing((state) => (state && state.id == null ? { ...state, id } : state))
      }
      load()
    },
  })

  /** Schließt erst, wenn der ausstehende Save durch ist. */
  const closeEditor = async (): Promise<void> => {
    try {
      await autosave.flush()
    } catch {
      // Fehler steht in der Statuszeile; Dialog bleibt offen, damit nichts verloren geht.
      return
    }
    setEditing(null)
    load()
  }

  const setStatus = async (id: number, status: ProjectStatus): Promise<void> => {
    // Ausstehende Änderungen zuerst sichern — der Statuswechsel schließt den Dialog.
    await autosave.flush().catch(() => undefined)
    await api.setProjectStatus(id, status)
    setEditing(null)
    load()
  }

  // Drag-to-reorder: the visible (filtered) projects are re-ordered relative to
  // each other; non-visible ones keep their place. Optimistic, then persisted.
  const handleReorder = (newVisible: Project[]): void => {
    const ids = newVisible.map((p) => p.id)
    const set = new Set(ids)
    setProjects((prev) => {
      if (!prev) return prev
      let k = 0
      return prev.map((p) => (set.has(p.id) ? newVisible[k++] : p))
    })
    void api.reorderProjects(ids).then(load)
  }

  const remove = async (): Promise<void> => {
    if (editing?.id == null) return
    await api.deleteProject(editing.id)
    setConfirmDelete(false)
    setEditing(null)
    load()
  }

  const patch = (p: Partial<Draft>): void =>
    setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...p } } : e))

  const q = query.trim().toLowerCase()
  const visible: Project[] = (projects ?? []).filter((p) => {
    if (archiveMode) {
      if (p.status !== 'Archived') return false
    } else {
      if (p.status === 'Archived') return false
      if (filter !== 'all' && p.status !== filter) return false
    }
    if (q === '') return true
    return p.title.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q)
  })

  // Live end-price preview: a fix price wins; otherwise hours × the selected
  // client's hourly rate (0 when no client / unknown client). Die Stunden
  // kommen aus dem Feld oder, wenn es leer ist, aus den Positionen.
  const draft = editing?.draft
  const draftRate =
    draft?.clientId != null
      ? clients.find((c) => c.id === draft.clientId)?.hourlyRate ?? 0
      : 0
  const draftFinal =
    draft != null
      ? draft.fixPrice ?? (projectHours(draft) ?? 0) * draftRate
      : 0
  // Info-Summe der Positions-Stunden (Plausibilitäts-Check gegen die globalen
  // Stunden — kein Zwang, Beträge hängen nur an den globalen Feldern).
  const itemHoursSum = draft?.items.reduce((s, it) => s + (it.hours ?? 0), 0) ?? 0

  return (
    <div style={{ maxWidth: 680, marginLeft: 'auto', marginRight: 'auto' }}>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-medium tracking-tight" style={{ color: 'var(--text)' }}>
          {archiveMode ? `${t.nav.projects} · ${t.project.archive}` : t.nav.projects}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t.actions.searchProjects}
            ariaLabel={t.actions.searchProjects}
          />
          <Button onClick={startNew}>{t.actions.newProject}</Button>
        </div>
      </header>

      <>
          {/* Status filter row / archive back affordance */}
          <div className="mb-5 flex items-center gap-1">
            {archiveMode ? (
              <button
                type="button"
                onClick={() => setArchiveMode(false)}
                className="rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:[box-shadow:var(--focus)]"
                style={{ color: 'var(--text-muted)' }}
              >
                {t.project.backToProjects}
              </button>
            ) : (
              <div className="flex flex-1 flex-wrap items-center gap-1">
                {STATUSES.map((s) => (
                  <SegPill key={s} active={filter === s} onClick={() => setFilter(s)}>
                    {t.project.status[s]}
                  </SegPill>
                ))}
                <SegPill active={filter === 'all'} onClick={() => setFilter('all')}>
                  {t.project.all}
                </SegPill>
                <button
                  type="button"
                  onClick={() => {
                    setArchiveMode(true)
                    setEditing(null)
                  }}
                  className="ml-auto rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:[box-shadow:var(--focus)]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {t.project.archive}
                </button>
              </div>
            )}
          </div>

          {/* List */}
          {projects === null ? (
            <p style={{ color: 'var(--text-muted)' }}>{t.common.loading}</p>
          ) : visible.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>
              {q === '' ? t.common.emptyProjects : t.common.noResults}
            </p>
          ) : (
            <Reorder.Group as="div" axis="y" values={visible} onReorder={handleReorder} className="grid gap-3">
              {visible.map((p, i) => (
                <ProjectCard
                  key={p.id}
                  p={p}
                  index={i}
                  archiveMode={archiveMode}
                  statusOptions={statusOptions}
                  onOpen={startEdit}
                  onStatus={(id, s) => void setStatus(id, s)}
                  onCreateInvoice={onCreateInvoice}
                />
              ))}
            </Reorder.Group>
          )}
        {/* Editor modal — overlays the page so the list never shifts (wie bei Kunden). */}
        <Modal
          open={editing != null}
          onClose={() => void closeEditor()}
          busy={saving || autosave.status === 'saving'}
          labelledBy="project-editor-title"
        >
          {editing && (
            <>
                <h2
                  id="project-editor-title"
                  className="mb-3 text-sm font-semibold"
                  style={{ color: 'var(--text)' }}
                >
                  {editing.id == null ? t.actions.newProject : editing.draft.title || t.nav.projects}
                </h2>
                <div className="grid gap-3">
                  <Field
                    label={t.project.title}
                    value={editing.draft.title}
                    onChange={(v) => patch({ title: v })}
                  />
                  <SelectField
                    label={t.project.client}
                    value={editing.draft.clientId == null ? '' : String(editing.draft.clientId)}
                    onChange={(v) => patch({ clientId: v === '' ? null : Number(v) })}
                  >
                    <option value="">{t.project.noClient}</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </SelectField>
                  <StatusSelect
                    label={t.project.statusLabel}
                    value={editing.draft.status}
                    options={statusOptions}
                    onChange={(v) => patch({ status: v as ProjectStatus })}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label={t.project.from}
                      type="date"
                      value={editing.draft.timeframeStart ?? ''}
                      onChange={(v) => patch({ timeframeStart: v === '' ? null : v })}
                    />
                    <Field
                      label={t.project.to}
                      type="date"
                      value={editing.draft.timeframeEnd ?? ''}
                      onChange={(v) => patch({ timeframeEnd: v === '' ? null : v })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <NumberField
                      label={t.project.hours}
                      step={0.25}
                      value={editing.draft.hours}
                      onChange={(v) => patch({ hours: v })}
                    />
                    <NumberField
                      label={t.project.fixPrice}
                      step={0.01}
                      value={editing.draft.fixPrice}
                      onChange={(v) => patch({ fixPrice: v })}
                    />
                  </div>
                  {/* Positionen: strukturierte Leistungsliste (ersetzt das frühere
                      Beschreibungsfeld; description bleibt als Backup in der DB). */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                        {t.project.items}
                      </span>
                      {itemHoursSum > 0 && (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {t.project.itemsHoursSum(fmtHours(itemHoursSum))}
                        </span>
                      )}
                    </div>
                    {editing.draft.items.length === 0 ? (
                      <p className="mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {t.project.itemsEmpty}
                      </p>
                    ) : (
                      <Reorder.Group
                        as="div"
                        axis="y"
                        values={editing.draft.items}
                        onReorder={(items: ItemDraft[]) => patch({ items })}
                        className="grid gap-2"
                      >
                        {editing.draft.items.map((it) => (
                          <PositionCard
                            key={it.key}
                            item={it}
                            onChange={(p) =>
                              patch({
                                items: editing.draft.items.map((x) =>
                                  x.key === it.key ? { ...x, ...p } : x,
                                ),
                              })
                            }
                            onRemove={() =>
                              patch({ items: editing.draft.items.filter((x) => x.key !== it.key) })
                            }
                          />
                        ))}
                      </Reorder.Group>
                    )}
                    <div className="mt-2">
                      <Button
                        variant="ghost"
                        onClick={() => patch({ items: [...editing.draft.items, newItemDraft()] })}
                      >
                        + {t.project.addItem}
                      </Button>
                    </div>
                  </div>
                  <TextAreaField
                    label={t.project.note}
                    value={editing.draft.note}
                    onChange={(v) => patch({ note: v })}
                  />

                  {/* Endpreis + "Rechnung erstellen" als Icon-Button rechts daneben */}
                  <div className="flex items-center gap-2">
                    <div
                      className="flex flex-1 items-center justify-between rounded-[10px] px-3 py-2 text-sm"
                      style={{ background: 'var(--field)' }}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>{t.project.finalPrice}</span>
                      <span className="font-medium break-words" style={{ color: 'var(--text)' }}>
                        {formatMoney(draftFinal)}
                      </span>
                    </div>
                    {editing.id != null && (
                      <motion.button
                        type="button"
                        title={
                          editing.draft.clientId != null
                            ? t.actions.createInvoiceFromProject
                            : t.project.needsClientForInvoice
                        }
                        aria-label={t.actions.createInvoiceFromProject}
                        disabled={editing.draft.clientId == null}
                        onClick={() =>
                          onCreateInvoice(editing.draft.clientId as number, [editing.id as number])
                        }
                        whileHover={editing.draft.clientId == null ? undefined : { y: -1 }}
                        whileTap={editing.draft.clientId == null ? undefined : { scale: 0.97 }}
                        transition={{ duration: 0.15, ease: 'easeOut' }}
                        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] transition-colors focus:outline-none focus-visible:[box-shadow:var(--focus)] disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ background: 'var(--surface-raised)', color: 'var(--accent)' }}
                      >
                        <Icon name="receipt" size={18} />
                      </motion.button>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="flex gap-2">
                      {editing.id != null && (
                        <>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(true)}
                            className="rounded-[10px] px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:[box-shadow:var(--focus)]"
                            style={{ color: 'var(--danger, #e5484d)' }}
                          >
                            {t.actions.delete}
                          </button>
                          {archiveMode ? (
                            <Button
                              variant="ghost"
                              onClick={() => void setStatus(editing.id as number, 'Active')}
                            >
                              {t.actions.restore}
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              onClick={() => void setStatus(editing.id as number, 'Archived')}
                            >
                              {t.actions.archive}
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {autosave.status === 'saving'
                          ? t.common.saving
                          : autosave.status === 'error'
                            ? t.common.saveFailed
                            : autosave.status === 'saved'
                              ? t.common.saved
                              : ''}
                      </span>
                      <Button variant="ghost" onClick={() => void closeEditor()}>
                        Fertig
                      </Button>
                    </div>
                  </div>
                </div>
            </>
          )}
        </Modal>

        {/* Delete confirmation — sits above the editor modal. */}
        {confirmDelete && editing?.id != null && (
          <ConfirmDialog
            title={t.project.deleteConfirm}
            body={t.project.deleteConfirmHint}
            confirmLabel={t.actions.delete}
            tone="danger"
            onCancel={() => setConfirmDelete(false)}
            onConfirm={() => void remove()}
          />
        )}
        </>
    </div>
  )
}
