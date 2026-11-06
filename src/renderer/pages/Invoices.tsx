import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Client, Invoice, InvoiceStatus, Project } from '@shared/types'
import { api } from '../lib/api'
import { canTransitionInvoice } from '@shared/invoice-status'
import { t } from '../i18n'
import { Panel } from '../components/Panel'
import { Button } from '../components/Button'
import { Icon, type IconName } from '../components/Icon'
import { StatusMenu } from '../components/StatusMenu'
import { PillToggle } from '../components/PillToggle'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { SegmentedControl } from '../components/SegmentedControl'
import { FileActions, fileUrl } from '../components/FileActions'
import { InvoiceEditor } from './InvoiceEditor'
import { InvoiceTemplate } from './InvoiceTemplate'
import { formatCurrency, formatDate } from '../i18n/format'

interface InvoiceSeed {
  clientId: number
  projectIds: number[]
}

// Solid status colours for the StatusMenu dot — chosen to read in both themes.
const statusColor: Record<InvoiceStatus, string> = {
  draft: '#9a9a9d',
  finalized: '#5aa6c9',
  sent: '#e3a24a',
  paid: '#4caf72',
  cancelled: '#b06a6a',
}

const INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'finalized', 'sent', 'paid', 'cancelled']

/** Square, borderless icon action — label is exposed via title + aria-label. */
function IconButton({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: IconName
  onClick: () => void
}): React.ReactElement {
  return (
    <motion.button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors focus:outline-none focus-visible:[box-shadow:var(--focus)]"
      style={{ background: 'var(--surface-raised)', color: 'var(--text)' }}
    >
      <Icon name={icon} size={18} />
    </motion.button>
  )
}

export function Invoices({
  seed,
  onConsumeSeed,
}: {
  seed: InvoiceSeed | null
  onConsumeSeed: () => void
}): React.ReactElement {
  const statusOptions = INVOICE_STATUSES.map((s) => ({
    value: s,
    label: t.invoice.status[s],
    color: statusColor[s],
  }))
  const [subTab, setSubTab] = useState<'rechnungen' | 'template'>('rechnungen')
  const [invoices, setInvoices] = useState<Invoice[] | null>(null)
  const [clientsById, setClientsById] = useState<Map<number, Client>>(new Map())
  const [editing, setEditing] = useState(false)
  const [initial, setInitial] = useState<{ clientId: number; projects: Project[] } | null>(null)
  // A saved draft reopened for editing (null when creating a new invoice).
  const [editingDraft, setEditingDraft] = useState<Invoice | null>(null)
  // A finalized invoice awaiting the storno + correction confirmation.
  const [storno, setStorno] = useState<Invoice | null>(null)
  const [stornoBusy, setStornoBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const load = (): void => {
    void Promise.all([api.listInvoices(), api.listClients()]).then(([inv, clients]) => {
      setInvoices(inv)
      setClientsById(new Map(clients.map((c) => [c.id, c])))
    })
  }
  useEffect(load, [])

  const setStatus = async (id: number, status: InvoiceStatus): Promise<void> => {
    await api.setInvoiceStatus(id, status)
    load()
  }

  const setPaid = async (id: number, paid: boolean): Promise<void> => {
    await api.setInvoicePaid(id, paid)
    load()
  }

  // Reopen a saved draft in the editor (load the full invoice first so items +
  // sub-items come along).
  const openDraft = async (id: number): Promise<void> => {
    const inv = await api.getInvoice(id)
    if (!inv) return
    setInitial(null)
    setEditingDraft(inv)
    setEditing(true)
  }

  const flashToast = (msg: string): void => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  // A finalized/sent/paid invoice can't be edited in place (GoBD): storno it and
  // open the fresh correction draft that the main process copies for us.
  const cancelAndCorrect = async (inv: Invoice): Promise<void> => {
    setStornoBusy(true)
    try {
      const copyId = await api.cancelAndCopyInvoice(inv.id)
      setStorno(null)
      load()
      flashToast(t.invoice.stornoDone)
      await openDraft(copyId)
    } catch (e) {
      flashToast(e instanceof Error ? e.message : String(e))
    } finally {
      setStornoBusy(false)
    }
  }

  // Re-render a finalized invoice's PDF from current master data (e.g. after a
  // client rename). Number, amounts and status are untouched.
  const regeneratePdf = async (id: number): Promise<void> => {
    try {
      await api.regenerateInvoicePdf(id)
      load()
      flashToast(t.invoice.pdfRegenerated)
    } catch (e) {
      flashToast(e instanceof Error ? e.message : String(e))
    }
  }

  // When App hands us a seed, resolve its projects and open the editor.
  useEffect(() => {
    if (!seed) return
    let cancelled = false
    const ids = new Set(seed.projectIds)
    void Promise.all(seed.projectIds.map((id) => api.getProject(id))).then((results) => {
      if (cancelled) return
      const projects = results.filter(
        (p): p is Project => p != null && ids.has(p.id),
      )
      setInitial({ clientId: seed.clientId, projects })
      setEditing(true)
      onConsumeSeed()
    })
    return () => {
      cancelled = true
    }
    // Re-run only when a new seed arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed])

  return (
    <>
    <AnimatePresence mode="wait">
      {editing ? (
        <motion.div
          key="editor"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <InvoiceEditor
            initial={initial ?? undefined}
            draft={editingDraft ?? undefined}
            onDone={() => {
              setEditing(false)
              setInitial(null)
              setEditingDraft(null)
              load()
            }}
          />
        </motion.div>
      ) : (
        <motion.div
          key="list"
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 12 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <div className="mb-6 flex justify-center">
            <SegmentedControl
              value={subTab}
              onChange={setSubTab}
              layoutId="invoice-subtab"
              segments={[
                { value: 'rechnungen', label: t.nav.invoices },
                { value: 'template', label: t.template.tab },
              ]}
            />
          </div>

          {subTab === 'template' ? (
            <InvoiceTemplate />
          ) : (
            <div style={{ maxWidth: 680, marginLeft: 'auto', marginRight: 'auto' }}>
              <header className="mb-6 flex items-center justify-between">
                <h1 className="text-2xl font-medium tracking-tight" style={{ color: 'var(--text)' }}>
                  {t.nav.invoices}
                </h1>
                <Button
                  onClick={() => {
                    setInitial(null)
                    setEditingDraft(null)
                    setEditing(true)
                  }}
                >
                  {t.actions.newInvoice}
                </Button>
              </header>

              {invoices === null ? (
                <p style={{ color: 'var(--text-muted)' }}>{t.common.loading}</p>
              ) : invoices.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>{t.common.emptyInvoices}</p>
              ) : (
                <div className="grid gap-3">
                  {invoices.map((inv, i) => {
                    const client = clientsById.get(inv.clientId)
                    return (
                      <Panel key={inv.id} index={i}>
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <StatusMenu
                                current={inv.status}
                                options={statusOptions.filter(
                                  (o) => o.value === inv.status || canTransitionInvoice(inv.status, o.value),
                                )}
                                onChange={(s) => void setStatus(inv.id, s as InvoiceStatus)}
                              />
                              <span className="font-medium break-words" style={{ color: 'var(--text)' }}>
                                {inv.number ?? t.invoice.draft}
                              </span>
                            </div>
                            <div className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                              {client?.name ?? t.common.none} · {formatDate(inv.date)}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 md:shrink-0 md:gap-3">
                            <PillToggle
                              label={t.finance.invoicePaid}
                              checked={inv.status === 'paid'}
                              disabled={inv.status === 'draft' || inv.status === 'cancelled'}
                              onChange={(next) => void setPaid(inv.id, next)}
                            />
                            <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                              {formatCurrency(inv.total, inv.currency)}
                            </span>
                            {inv.status !== 'cancelled' && (
                              <IconButton
                                label={
                                  inv.status === 'draft'
                                    ? t.actions.editInvoice
                                    : t.actions.cancelAndCorrect
                                }
                                icon="pencil"
                                onClick={() =>
                                  inv.status === 'draft'
                                    ? void openDraft(inv.id)
                                    : setStorno(inv)
                                }
                              />
                            )}
                            {inv.pdfPath && <FileActions url={fileUrl('invoice', inv.id)} />}
                            {inv.number && (
                              <IconButton
                                label={t.actions.regeneratePdf}
                                icon="refresh"
                                onClick={() => void regeneratePdf(inv.id)}
                              />
                            )}
                          </div>
                        </div>
                      </Panel>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
    {storno && (
      <ConfirmDialog
        title={t.invoice.stornoTitle}
        body={t.invoice.stornoBody(storno.number ?? t.invoice.draft)}
        confirmLabel={t.invoice.stornoConfirm}
        busy={stornoBusy}
        onCancel={() => setStorno(null)}
        onConfirm={() => void cancelAndCorrect(storno)}
      />
    )}
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-[10px] px-4 py-2 text-sm"
          style={{ background: 'var(--surface-raised)', color: 'var(--text)', boxShadow: 'var(--shadow)' }}
        >
          {toast}
        </motion.div>
      )}
    </AnimatePresence>
    </>
  )
}
