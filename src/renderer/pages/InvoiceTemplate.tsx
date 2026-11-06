import { useEffect, useRef, useState } from 'react'
import type { InvoiceTemplate } from '@shared/types'
import { api } from '../lib/api'
import { pickFile } from '../lib/pick-file'
import { t } from '../i18n'
import { Panel } from '../components/Panel'
import { Button } from '../components/Button'
import { NumberField, TextAreaField, ToggleField, ColorField, SelectField } from '../components/Field'
import { FontPicker } from '../components/FontPicker'

export function InvoiceTemplate(): React.ReactElement {
  const [tpl, setTpl] = useState<InvoiceTemplate | null>(null)
  const [html, setHtml] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => { void api.getInvoiceTemplate().then(setTpl) }, [])

  const patch = (p: Partial<InvoiceTemplate>): void => setTpl((c) => (c ? { ...c, ...p } : c))

  // Debounced live preview.
  useEffect(() => {
    if (!tpl) return
    const timer = setTimeout(() => { void api.renderTemplatePreview(tpl).then(setHtml) }, 300)
    return () => clearTimeout(timer)
  }, [tpl])

  if (!tpl) return <p style={{ color: 'var(--text-muted)' }}>{t.common.loading}</p>

  const save = async (): Promise<void> => {
    await api.saveInvoiceTemplate(tpl)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <>
      <div className="hidden lg:block">
        <div className="flex items-start gap-5">
      <div className="flex w-[340px] shrink-0 flex-col gap-4">
        <Panel>
          <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text)' }}>{t.template.brand}</h3>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={async () => {
                  const file = await pickFile('image/png,image/jpeg,image/webp')
                  if (!file) return
                  const form = new FormData()
                  form.append('file', file)
                  const response = await fetch('/api/uploads/logo', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'x-hustl-client': 'web' },
                    body: form,
                  })
                  if (!response.ok) return
                  const body = (await response.json()) as { logoPath?: string }
                  if (body.logoPath) patch({ logoPath: body.logoPath })
                }}
              >
                {t.template.pickLogo}
              </Button>
              {tpl.logoPath && <Button variant="ghost" onClick={() => patch({ logoPath: null })}>{t.template.removeLogo}</Button>}
            </div>
            <NumberField label={t.template.logoWidth} value={tpl.logoWidthMm} onChange={(v) => patch({ logoWidthMm: v ?? 34 })} />
            <SelectField label={t.template.logoAlign} value={tpl.logoAlign} onChange={(v) => patch({ logoAlign: v as 'left' | 'right' })}>
              <option value="left">{t.template.alignLeft}</option>
              <option value="right">{t.template.alignRight}</option>
            </SelectField>
            <ColorField label={t.template.accent} value={tpl.accentColor} onChange={(v) => patch({ accentColor: v })} />
            <div>
              <span className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t.template.font} · {tpl.fontFamily}</span>
              <FontPicker current={tpl.fontFamily} onPicked={(fontFamily, fontSource, fontFiles) => patch({ fontFamily, fontSource, fontFiles })} />
            </div>
          </div>
        </Panel>

        <Panel>
          <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text)' }}>{t.template.blocks}</h3>
          <div className="flex flex-col gap-2">
            <ToggleField label={t.template.showSubtitle} value={tpl.showSubtitle} onChange={(v) => patch({ showSubtitle: v })} />
            <ToggleField label={t.template.showTaxNumber} value={tpl.showTaxNumber} onChange={(v) => patch({ showTaxNumber: v })} />
            <ToggleField label={t.template.showBankDetails} value={tpl.showBankDetails} onChange={(v) => patch({ showBankDetails: v })} />
            <ToggleField label={t.template.showServicePeriod} value={tpl.showServicePeriod} onChange={(v) => patch({ showServicePeriod: v })} />
            <NumberField label={t.template.marginTop} value={tpl.marginTopMm} onChange={(v) => patch({ marginTopMm: v ?? 20 })} />
            <NumberField label={t.template.marginX} value={tpl.marginXMm} onChange={(v) => patch({ marginXMm: v ?? 15 })} />
          </div>
        </Panel>

        <Panel>
          <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text)' }}>{t.template.texts}</h3>
          <div className="flex flex-col gap-3">
            <TextAreaField label={t.template.intro} rows={2} value={tpl.introText} onChange={(v) => patch({ introText: v })} />
            <TextAreaField label={t.template.closing} rows={2} value={tpl.closingText} onChange={(v) => patch({ closingText: v })} />
            <TextAreaField label={t.template.footer} rows={2} value={tpl.footerNote} onChange={(v) => patch({ footerNote: v })} />
          </div>
        </Panel>

        <Panel>
          <h3 className="mb-3 text-sm font-semibold" style={{ color: 'var(--text)' }}>{t.template.metaRows}</h3>
          <div className="flex flex-col gap-2">
            {tpl.metaRows.map((r, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={r.label}
                  placeholder={t.template.metaLabel}
                  onChange={(e) => patch({ metaRows: tpl.metaRows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                  className="w-full rounded-[10px] px-3 py-2 text-sm focus:outline-none focus-visible:[box-shadow:var(--focus)]"
                  style={{ background: 'var(--field)', color: 'var(--text)' }}
                />
                <input
                  value={r.value}
                  placeholder={t.template.metaValue}
                  onChange={(e) => patch({ metaRows: tpl.metaRows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
                  className="w-full rounded-[10px] px-3 py-2 text-sm focus:outline-none focus-visible:[box-shadow:var(--focus)]"
                  style={{ background: 'var(--field)', color: 'var(--text)' }}
                />
                <button
                  type="button"
                  onClick={() => patch({ metaRows: tpl.metaRows.filter((_, j) => j !== i) })}
                  style={{ color: 'var(--text-muted)' }}
                >
                  ✕
                </button>
              </div>
            ))}
            <Button variant="ghost" onClick={() => patch({ metaRows: [...tpl.metaRows, { label: '', value: '' }] })}>{t.template.addMetaRow}</Button>
          </div>
        </Panel>

        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-xs" style={{ color: 'var(--accent)' }}>{t.template.saved}</span>}
          <Button onClick={() => void save()}>{t.actions.save}</Button>
        </div>
      </div>

      <TemplatePreviewPane html={html} />
        </div>
      </div>
      <div className="lg:hidden">
        <Panel>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {t.template.desktopOnly}
          </p>
        </Panel>
      </div>
    </>
  )
}

// A4 dimensions in px (210 mm ≈ 794 px, 297 mm ≈ 1123 px).
const A4_W = 794
const A4_H = 1123

/** Responsive A4 preview that fills the available column width. */
function TemplatePreviewPane({ html }: { html: string }): React.ReactElement {
  const paneRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(460)

  useEffect(() => {
    const el = paneRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = width / A4_W
  const clipHeight = A4_H * scale

  return (
    <div ref={paneRef} className="min-w-0 flex-1">
      <div className="mb-2 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t.template.preview}</div>
      <div
        className="overflow-hidden rounded-[10px]"
        style={{ height: clipHeight, background: '#fff' }}
      >
        {html && (
          <iframe
            sandbox=""
            title={t.template.preview}
            srcDoc={html}
            style={{
              width: A4_W,
              height: A4_H,
              border: 0,
              background: '#fff',
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          />
        )}
      </div>
    </div>
  )
}
