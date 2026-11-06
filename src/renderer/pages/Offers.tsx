import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Offer, OfferStatus } from '@shared/types'
import { api } from '../lib/api'
import { t } from '../i18n'
import { Panel } from '../components/Panel'
import { Button } from '../components/Button'
import { Icon, type IconName } from '../components/Icon'
import { StatusMenu } from '../components/StatusMenu'
import { FileActions, fileUrl } from '../components/FileActions'
import { OfferEditor } from './OfferEditor'
import { formatCurrency, formatDate } from '../i18n/format'

const statusColor: Record<OfferStatus, string> = {
  draft: '#9a9a9d', sent: '#e3a24a', accepted: '#4caf72', declined: '#b06a6a', invoiced: '#5aa6c9',
}
const OFFER_STATUSES: OfferStatus[] = ['draft', 'sent', 'accepted', 'declined', 'invoiced']

function isExpired(o: Offer): boolean {
  return o.status === 'sent' && o.validUntil.slice(0, 10) < new Date().toISOString().slice(0, 10)
}

export function Offers(): React.ReactElement {
  const statusOptions = OFFER_STATUSES.map((s) => ({
    value: s,
    label: t.offer.status[s],
    color: statusColor[s],
  }))
  const [offers, setOffers] = useState<Offer[] | null>(null)
  const [editingId, setEditingId] = useState<number | 'new' | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = (): void => { void api.listOffers().then(setOffers) }
  useEffect(load, [])

  const flashToast = (msg: string): void => {
    setToast(msg); setTimeout(() => setToast(null), 2500)
  }

  const setStatus = async (id: number, status: OfferStatus): Promise<void> => {
    await api.setOfferStatus(id, status); load()
  }

  /** Runs one of the two conversion actions, reporting either way via toast. */
  const convert = async (run: () => Promise<string>): Promise<void> => {
    setBusy(true)
    try {
      flashToast(await run())
      load()
    } catch (e) {
      flashToast(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const createClientFor = (id: number): Promise<void> => convert(async () => {
    const r = await api.createOfferClient(id)
    return r.created ? t.offer.clientCreated(r.clientName) : t.offer.clientExists(r.clientName)
  })

  const createProjectFor = (id: number): Promise<void> => convert(async () => {
    const r = await api.convertOfferToProject(id)
    return r.created ? t.offer.projectCreated(r.projectTitle) : t.offer.projectExists
  })

  if (editingId !== null) {
    return (
      <OfferEditor
        offerId={editingId === 'new' ? undefined : editingId}
        onDone={() => { setEditingId(null); load() }}
      />
    )
  }

  return (
    <>
      <div style={{ maxWidth: 680, marginLeft: 'auto', marginRight: 'auto' }}>
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-medium tracking-tight" style={{ color: 'var(--text)' }}>{t.offer.title}</h1>
          <Button onClick={() => setEditingId('new')}>{t.offer.newOffer}</Button>
        </header>

        {offers === null ? (
          <p style={{ color: 'var(--text-muted)' }}>{t.common.loading}</p>
        ) : offers.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>{t.offer.empty}</p>
        ) : (
          <div className="grid gap-3">
            {offers.map((o, i) => (
              <Panel key={o.id} index={i}>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusMenu current={o.status} options={statusOptions} onChange={(s) => void setStatus(o.id, s as OfferStatus)} />
                      <button
                        type="button"
                        onClick={() => setEditingId(o.id)}
                        className="font-medium focus:outline-none focus-visible:[box-shadow:var(--focus)]"
                        style={{ color: 'var(--text)' }}
                      >
                        {o.number ?? t.offer.status.draft}
                      </button>
                      {isExpired(o) && (
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: 'var(--surface-raised)', color: '#b06a6a' }}>
                          {t.offer.expired}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-sm break-words" style={{ color: 'var(--text-muted)' }}>
                      {(o.clientName || o.prospect.name || t.common.none)} · {o.kind === 'angebot' ? t.offer.kindAngebot : t.offer.kindKva} · {formatDate(o.date)}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
                    <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{formatCurrency(o.total, o.currency)}</span>
                    {o.pdfPath && <FileActions url={fileUrl('offer', o.id)} />}
                    {o.clientId == null && (
                      <IconBtn
                        label={t.actions.createClientFromOffer} icon="users" disabled={busy}
                        onClick={() => void createClientFor(o.id)}
                      />
                    )}
                    <IconBtn
                      label={o.convertedProjectId != null ? t.offer.projectExists : t.actions.createProjectFromOffer}
                      icon="layout"
                      disabled={busy || o.convertedProjectId != null}
                      onClick={() => void createProjectFor(o.id)}
                    />
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
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

function IconBtn(
  { label, icon, onClick, disabled = false }:
  { label: string; icon: IconName; onClick: () => void; disabled?: boolean },
): React.ReactElement {
  return (
    <motion.button
      type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled}
      whileHover={disabled ? undefined : { y: -1 }} whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors focus:outline-none focus-visible:[box-shadow:var(--focus)] disabled:cursor-default"
      style={{ background: 'var(--surface-raised)', color: 'var(--text)', opacity: disabled ? 0.4 : 1 }}
    >
      <Icon name={icon} size={18} />
    </motion.button>
  )
}
