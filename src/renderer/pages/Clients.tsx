import { useEffect, useRef, useState } from 'react'
import type { Client } from '@shared/types'
import { api } from '../lib/api'
import { t } from '../i18n'
import { Panel } from '../components/Panel'
import { Button } from '../components/Button'
import { SearchInput } from '../components/SearchInput'
import { Chip } from '../components/StatusChip'
import { Field, NumberField, SelectField, TextAreaField } from '../components/Field'
import { Modal } from '../components/Modal'
import { useAutosave } from '../lib/use-autosave'
import { formatCurrency } from '../i18n/format'
import { CURRENCIES } from '../lib/currencies'

type Draft = Omit<Client, 'id'>

const DOC_LANGUAGES: Array<{ value: '' | 'de' | 'en'; label: string }> = [
  { value: '', label: '' },
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
]

function taxModeLabel(mode: Client['taxMode']): string {
  switch (mode) {
    case 'reverse_charge':
      return t.tax.reverseCharge
    case 'small_business':
      return t.tax.smallBusiness
    case 'reduced':
      return t.tax.reduced
    case 'zero':
      return t.tax.zero
    case 'exempt':
      return t.tax.exempt
    default:
      return t.tax.standard
  }
}

function emptyDraft(): Draft {
  return {
    notionId: null,
    name: '',
    contactPerson: '',
    addressExtra: '',
    address: '',
    street: '',
    zip: '',
    city: '',
    country: '',
    countryCode: '',
    currency: '',
    language: '',
    taxMode: 'standard',
    email: '',
    hourlyRate: 0,
    noTax: false,
    vatId: null,
    notes: '',
  }
}

export function Clients(): React.ReactElement {
  const [clients, setClients] = useState<Client[] | null>(null)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<{ id?: number; draft: Draft } | null>(null)
  const [saving] = useState(false)

  const load = (): void => {
    void api.listClients().then(setClients)
  }
  useEffect(load, [])

  const startNew = (): void => setEditing({ draft: emptyDraft() })
  const startEdit = (c: Client): void =>
    setEditing({
      id: c.id,
      draft: {
        notionId: c.notionId,
        name: c.name,
        contactPerson: c.contactPerson,
        addressExtra: c.addressExtra,
        address: c.address,
        street: c.street,
        zip: c.zip,
        city: c.city,
        country: c.country,
        countryCode: c.countryCode,
        currency: c.currency,
        language: c.language,
        taxMode: c.taxMode,
        email: c.email,
        hourlyRate: c.hourlyRate,
        noTax: c.noTax,
        vatId: c.vatId,
        notes: c.notes,
      },
    })

  const editingRef = useRef(editing)
  editingRef.current = editing

  const autosave = useAutosave({
    value: editing?.draft ?? null,
    enabled: editing != null,
    delay: 600,
    save: async (draft) => {
      const current = editingRef.current
      if (!current || !draft) return
      if (current.id == null && draft.name.trim() === '') return
      const id = await api.saveClient(draft, current.id)
      if (current.id == null) {
        setEditing((state) => (state && state.id == null ? { ...state, id } : state))
      }
      load()
    },
  })

  const closeEditor = async (): Promise<void> => {
    try {
      await autosave.flush()
    } catch {
      return
    }
    setEditing(null)
    load()
  }

  const patch = (p: Partial<Draft>): void =>
    setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...p } } : e))

  // The address preview shown on each card, also matched by the search box.
  const previewOf = (c: Client): string =>
    [c.street, [c.zip, c.city].filter(Boolean).join(' '), c.country].filter(Boolean).join(', ') ||
    c.address.split('\n').filter(Boolean).join(', ')

  const q = query.trim().toLowerCase()
  const visible: Client[] = (clients ?? []).filter((c) => {
    if (q === '') return true
    return (
      c.name.toLowerCase().includes(q) ||
      c.contactPerson.toLowerCase().includes(q) ||
      previewOf(c).toLowerCase().includes(q)
    )
  })

  // The editor form, shown inside the modal for both "new client" and editing
  // an existing one. Fields stack in a single column.
  const editorForm = (draft: Draft): React.ReactElement => (
    <div className="grid gap-3">
      <Field label={t.client.name} value={draft.name} onChange={(v) => patch({ name: v })} />
      <Field
        label={t.client.contactPerson}
        value={draft.contactPerson}
        onChange={(v) => patch({ contactPerson: v })}
      />
      <Field
        label={t.client.addressExtra}
        value={draft.addressExtra}
        onChange={(v) => patch({ addressExtra: v })}
      />
      <Field label={t.client.street} value={draft.street} onChange={(v) => patch({ street: v })} />
      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <Field label={t.client.zip} value={draft.zip} onChange={(v) => patch({ zip: v })} />
        <Field label={t.client.city} value={draft.city} onChange={(v) => patch({ city: v })} />
      </div>
      <div className="grid grid-cols-[1fr_1fr] gap-3">
        <Field label={t.client.country} value={draft.country} onChange={(v) => patch({ country: v })} />
        <Field
          label={t.client.countryCode}
          value={draft.countryCode}
          onChange={(v) => patch({ countryCode: v.toUpperCase().slice(0, 2) })}
        />
      </div>
      <div className="grid grid-cols-[1fr_1fr] gap-3">
        <SelectField
          label={t.client.currency}
          value={draft.currency}
          onChange={(v) => patch({ currency: v })}
        >
          <option value="">{t.common.default}</option>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t.client.language}
          value={draft.language}
          onChange={(v) => patch({ language: v as Draft['language'] })}
        >
          {DOC_LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label || t.common.default}
            </option>
          ))}
        </SelectField>
      </div>
      <Field
        label={t.client.email}
        type="email"
        value={draft.email}
        onChange={(v) => patch({ email: v })}
      />
      <NumberField
        label={t.client.hourlyRate}
        step={0.01}
        value={draft.hourlyRate}
        onChange={(v) => patch({ hourlyRate: v ?? 0 })}
      />
      <SelectField
        label={t.client.taxMode}
        value={draft.taxMode}
        onChange={(v) =>
          patch({
            taxMode: v as Draft['taxMode'],
            noTax: v === 'small_business' || v === 'exempt',
          })
        }
      >
        <option value="standard">{t.tax.standard}</option>
        <option value="reverse_charge">{t.tax.reverseCharge}</option>
        <option value="small_business">{t.tax.smallBusiness}</option>
        <option value="zero">{t.tax.zero}</option>
        <option value="exempt">{t.tax.exempt}</option>
      </SelectField>
      <Field
        label={t.client.vatId}
        value={draft.vatId ?? ''}
        onChange={(v) => patch({ vatId: v === '' ? null : v })}
      />
      <TextAreaField label={t.client.notes} value={draft.notes} onChange={(v) => patch({ notes: v })} />
    </div>
  )

  return (
    <div style={{ maxWidth: 1040, marginLeft: 'auto', marginRight: 'auto' }}>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-medium tracking-tight" style={{ color: 'var(--text)' }}>
          {t.nav.clients}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t.actions.searchClients}
            ariaLabel={t.actions.searchClients}
          />
          <Button onClick={startNew}>{t.actions.newClient}</Button>
        </div>
      </header>

      {clients === null ? (
        <p style={{ color: 'var(--text-muted)' }}>{t.common.loading}</p>
      ) : clients.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>{t.common.emptyClients}</p>
      ) : visible.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>{t.common.noResults}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visible.map((c, i) => {
            const preview = previewOf(c)
            return (
              // Fixed min-height + centered content keeps every card the same
              // size whether or not it has an address preview or a chip.
              <Panel
                key={c.id}
                index={i}
                onClick={() => startEdit(c)}
                className="flex min-h-[92px] items-center"
              >
                <div className="flex w-full items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium break-words" style={{ color: 'var(--text)' }}>
                      {c.name}
                    </div>
                    {preview && (
                      <div className="mt-1 truncate text-sm" style={{ color: 'var(--text-muted)' }}>
                        {preview}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="text-sm" style={{ color: 'var(--text)' }}>
                      {formatCurrency(c.hourlyRate, c.currency || 'EUR')} {t.client.perHour}
                    </span>
                    {c.taxMode !== 'standard' && <Chip>{taxModeLabel(c.taxMode)}</Chip>}
                  </div>
                </div>
              </Panel>
            )
          })}
        </div>
      )}

      {/* Edit / new client modal — overlays the page so the grid never shifts. */}
      <Modal
        open={editing != null}
        onClose={() => void closeEditor()}
        busy={saving || autosave.status === 'saving'}
        labelledBy="client-editor-title"
        widthClass="max-w-lg"
      >
        {editing && (
          <>
              <h2
                id="client-editor-title"
                className="mb-3 text-sm font-semibold"
                style={{ color: 'var(--text)' }}
              >
                {editing.id == null ? t.actions.newClient : editing.draft.name || t.nav.clients}
              </h2>
              {editorForm(editing.draft)}
              <div className="mt-3 flex items-center justify-end gap-3">
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
                  {t.common.done}
                </Button>
              </div>
          </>
        )}
      </Modal>
    </div>
  )
}
