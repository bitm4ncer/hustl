import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { CompanySettings } from '@shared/types'
import { api } from '../lib/api'
import { t } from '../i18n'
import { Panel } from '../components/Panel'
import { Button } from '../components/Button'
import { Field, NumberField, SelectField, TextAreaField, ToggleField } from '../components/Field'
import { SegmentedControl } from '../components/SegmentedControl'
import { LanguageToggle } from '../components/LanguageToggle'
import { useTheme } from '../theme/ThemeProvider'

type Tab = 'invoice' | 'theme' | 'data'

export function Settings(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('invoice')
  return (
    <div style={{ maxWidth: 680, marginLeft: 'auto', marginRight: 'auto' }}>
      <header className="mb-6">
        <h1 className="text-2xl font-medium tracking-tight" style={{ color: 'var(--text)' }}>
          {t.nav.settings}
        </h1>
      </header>
      <div className="mb-6">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          layoutId="settings-tab"
          segments={[
            { value: 'invoice', label: t.settings.tabs.invoice },
            { value: 'theme', label: t.settings.tabs.theme },
            { value: 'data', label: t.settings.tabs.data },
          ]}
        />
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="grid gap-4"
        >
          {tab === 'invoice' && (
            <>
              <CompanySection />
              <OfferSection />
              <NumberingSection />
            </>
          )}
          {tab === 'theme' && <ThemeSection />}
          {tab === 'data' && <DataSection />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <h2 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text)' }}>
      {children}
    </h2>
  )
}

function Saved({ show }: { show: boolean }): React.ReactElement {
  return (
    <AnimatePresence>
      {show && (
        <motion.span
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="text-xs"
          style={{ color: 'var(--accent)' }}
        >
          {t.settings.saved}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

function CompanySection(): React.ReactElement {
  const [s, setS] = useState<CompanySettings | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void api.getSettings().then(setS)
  }, [])

  const patch = (p: Partial<CompanySettings>): void => setS((cur) => (cur ? { ...cur, ...p } : cur))

  const save = async (): Promise<void> => {
    if (!s) return
    await api.saveSettings(s)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  if (!s) {
    return (
      <Panel>
        <SectionTitle>{t.settings.company}</SectionTitle>
        <p style={{ color: 'var(--text-muted)' }}>{t.common.loading}</p>
      </Panel>
    )
  }

  return (
    <Panel>
      <SectionTitle>{t.settings.company}</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.settings.companyName} value={s.name} onChange={(v) => patch({ name: v })} />
        <Field label={t.settings.subtitle} value={s.subtitle} onChange={(v) => patch({ subtitle: v })} />
      </div>

      <div className="mt-5">
        <h3 className="mb-3 text-xs font-semibold" style={{ color: 'var(--text)' }}>
          {t.settings.eInvoiceAddress}
        </h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-4">
            <Field label={t.settings.sellerStreet} value={s.sellerStreet} onChange={(v) => patch({ sellerStreet: v })} />
          </div>
          <div className="sm:col-span-1">
            <Field label={t.settings.sellerZip} value={s.sellerZip} onChange={(v) => patch({ sellerZip: v })} />
          </div>
          <div className="sm:col-span-2">
            <Field label={t.settings.sellerCity} value={s.sellerCity} onChange={(v) => patch({ sellerCity: v })} />
          </div>
          <div className="sm:col-span-1">
            <Field
              label={t.settings.sellerCountry}
              value={s.sellerCountryCode}
              onChange={(v) => patch({ sellerCountryCode: v })}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field label={t.settings.phone} value={s.phone} onChange={(v) => patch({ phone: v })} />
        <Field label={t.settings.email} type="email" value={s.email} onChange={(v) => patch({ email: v })} />
        <Field label={t.settings.taxNumber} value={s.taxNumber} onChange={(v) => patch({ taxNumber: v })} />
        <Field label={t.settings.vatId} value={s.vatId} onChange={(v) => patch({ vatId: v })} />
        <NumberField
          label={t.settings.defaultTaxRate}
          step={0.1}
          value={(s.defaultTaxRate ?? 0.19) * 100}
          onChange={(v) => patch({ defaultTaxRate: (v ?? 0) / 100 })}
        />
        <SelectField
          label={t.settings.documentLanguage}
          value={s.documentLanguage ?? 'de'}
          onChange={(v) => patch({ documentLanguage: v as CompanySettings['documentLanguage'] })}
        >
          <option value="de">Deutsch</option>
          <option value="en">English</option>
        </SelectField>
        <Field label={t.settings.iban} value={s.iban} onChange={(v) => patch({ iban: v })} />
        <Field label={t.settings.bic} value={s.bic} onChange={(v) => patch({ bic: v })} />
        <Field label={t.settings.bankName} value={s.bank} onChange={(v) => patch({ bank: v })} />
        <NumberField
          label={t.settings.paymentTermsDays}
          value={s.paymentTermsDays}
          onChange={(v) => patch({ paymentTermsDays: v ?? 0 })}
        />
        <div className="sm:col-span-2">
          <Field
            label={t.settings.recipientName}
            value={s.recipientName}
            onChange={(v) => patch({ recipientName: v })}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-3">
        <Saved show={saved} />
        <Button onClick={() => void save()}>{t.actions.save}</Button>
      </div>
    </Panel>
  )
}

function OfferSection(): React.ReactElement {
  const [s, setS] = useState<CompanySettings | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void api.getSettings().then(setS)
  }, [])

  const patch = (p: Partial<CompanySettings>): void => setS((cur) => (cur ? { ...cur, ...p } : cur))

  const save = async (): Promise<void> => {
    if (!s) return
    const fresh = await api.getSettings()
    await api.saveSettings({
      ...fresh,
      kleinunternehmer: s.kleinunternehmer,
      offerValidityDays: s.offerValidityDays,
      offerNumberPrefix: s.offerNumberPrefix,
      offerIntroText: s.offerIntroText,
      offerClosingText: s.offerClosingText,
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  if (!s) {
    return (
      <Panel>
        <SectionTitle>{t.settings.offerSection}</SectionTitle>
        <p style={{ color: 'var(--text-muted)' }}>{t.common.loading}</p>
      </Panel>
    )
  }

  return (
    <Panel>
      <SectionTitle>{t.settings.offerSection}</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <ToggleField
            label={t.settings.kleinunternehmer}
            value={s.kleinunternehmer ?? false}
            onChange={(v) => patch({ kleinunternehmer: v })}
          />
        </div>
        <NumberField
          label={t.settings.offerValidityDays}
          step={1}
          value={s.offerValidityDays ?? 14}
          onChange={(v) => patch({ offerValidityDays: v ?? 14 })}
        />
        <Field
          label={t.settings.offerNumberPrefix}
          value={s.offerNumberPrefix ?? ''}
          onChange={(v) => patch({ offerNumberPrefix: v })}
        />
        <div className="sm:col-span-2">
          <TextAreaField
            label={t.settings.offerIntroText}
            rows={2}
            value={s.offerIntroText ?? ''}
            onChange={(v) => patch({ offerIntroText: v })}
          />
        </div>
        <div className="sm:col-span-2">
          <TextAreaField
            label={t.settings.offerClosingText}
            rows={2}
            value={s.offerClosingText ?? ''}
            onChange={(v) => patch({ offerClosingText: v })}
          />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        <Saved show={saved} />
        <Button onClick={() => void save()}>{t.actions.save}</Button>
      </div>
    </Panel>
  )
}

function NumberingSection(): React.ReactElement {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState<number>(currentYear)
  const [lastNumber, setLastNumber] = useState<number>(0)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void api.getNumberSequence(year).then((seq) => setLastNumber(seq?.lastNumber ?? 0))
  }, [year])

  const save = async (): Promise<void> => {
    await api.setNumberSequence(year, lastNumber)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <Panel>
      <SectionTitle>{t.settings.numbering}</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField label={t.settings.year} value={year} onChange={(v) => setYear(v ?? currentYear)} />
        <NumberField
          label={t.settings.lastNumber}
          value={lastNumber}
          onChange={(v) => setLastNumber(v ?? 0)}
        />
      </div>
      <div className="mt-4 flex items-center justify-end gap-3">
        <Saved show={saved} />
        <Button onClick={() => void save()}>{t.actions.save}</Button>
      </div>
    </Panel>
  )
}

function DataSection(): React.ReactElement {
  const [started, setStarted] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function restore(): Promise<void> {
    if (!file) return
    setRestoring(true)
    setError(null)
    try {
      const response = await fetch(`/api/restore${confirming ? '?confirm=1' : ''}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/zip', 'x-hustl-client': 'web' },
        body: file
      })
      if (response.status === 409) {
        setConfirming(true)
        return
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error || t.settings.data.restoreFailed)
      }
      setRestarting(true)
      window.setTimeout(() => window.location.reload(), 3000)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setRestoring(false)
    }
  }

  return (
    <Panel>
      <SectionTitle>{t.settings.data.title}</SectionTitle>
      <p className="mb-3 text-sm" style={{ color: 'var(--text-muted)' }}>
        {t.settings.data.hint}
      </p>
      <a
        href="/api/export/full"
        onClick={() => setStarted(true)}
        className="inline-flex min-h-[48px] items-center rounded-[10px] px-4 py-2 text-sm font-medium"
        style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
      >
        {t.settings.data.download}
      </a>
      {started && (
        <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          {t.settings.data.running}
        </p>
      )}

      <div className="mt-6 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
        <p className="mb-2 text-sm font-medium">{t.settings.data.restore}</p>
        <p className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          {t.settings.data.restoreHint}
        </p>
        <input
          type="file"
          accept=".zip,application/zip"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null)
            setConfirming(false)
            setError(null)
          }}
          className="mb-3 block text-sm"
        />
        {confirming && (
          <p className="mb-2 text-xs" style={{ color: 'var(--accent)' }}>
            {t.settings.data.restoreConfirm}
          </p>
        )}
        <button
          type="button"
          disabled={!file || restoring}
          onClick={() => void restore()}
          className="inline-flex min-h-[48px] items-center rounded-[10px] px-4 py-2 text-sm font-medium disabled:opacity-50"
          style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
        >
          {restoring
            ? t.settings.data.restoreRunning
            : confirming
              ? t.settings.data.restoreConfirmAction
              : t.settings.data.restoreAction}
        </button>
        {restarting && (
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            {t.settings.data.restoreRestarting}
          </p>
        )}
        {error && (
          <p className="mt-2 text-xs" style={{ color: '#ff7b72' }}>
            {error}
          </p>
        )}
      </div>
    </Panel>
  )
}

function ThemeSection(): React.ReactElement {
  const { theme, setTheme } = useTheme()
  return (
    <Panel>
      <SectionTitle>{t.settings.theme}</SectionTitle>
      <SelectField
        label={t.settings.theme}
        value={theme}
        onChange={(v) => setTheme(v as 'light' | 'dark' | 'system')}
      >
        <option value="light">{t.settings.light}</option>
        <option value="dark">{t.settings.dark}</option>
        <option value="system">{t.settings.system}</option>
      </SelectField>
      <div className="mt-4 flex items-center justify-between gap-4">
        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
          {t.language.label}
        </span>
        <LanguageToggle />
      </div>
    </Panel>
  )
}
