import { motion } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

const baseInput =
  'w-full rounded-[10px] px-3 py-2 text-sm transition-shadow focus:outline-none focus-visible:[box-shadow:var(--focus)]'

const inputStyle = {
  background: 'var(--field)',
  color: 'var(--text)',
} as const

function Label({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <span className="mb-1.5 block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
      {children}
    </span>
  )
}

interface TextFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  type?: 'text' | 'email' | 'password' | 'date'
  placeholder?: string
  readOnly?: boolean
  inputMode?: 'text' | 'decimal' | 'numeric'
  enterKeyHint?: 'next' | 'done' | 'go' | 'search' | 'send'
  autoComplete?: string
}

export function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  readOnly,
  inputMode,
  enterKeyHint,
  autoComplete,
}: TextFieldProps): React.ReactElement {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        inputMode={inputMode}
        enterKeyHint={enterKeyHint}
        autoComplete={autoComplete}
        onFocus={(e) => {
          if (window.innerWidth < 768) {
            e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })
          }
        }}
        onChange={(e) => onChange(e.target.value)}
        className={`${baseInput} ${readOnly ? 'opacity-70' : ''}`}
        style={inputStyle}
      />
    </label>
  )
}

interface NumberFieldProps {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  step?: number
}

export function NumberField({
  label,
  value,
  onChange,
  placeholder,
  step,
}: NumberFieldProps): React.ReactElement {
  // Eigener Textzustand: sonst schreibt der Elternwert (z. B. 0) bei jedem
  // Tastendruck zurück und man kann das Feld nicht leeren.
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setDraft(value == null ? '' : String(value))
  }, [value])

  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={draft}
        placeholder={placeholder}
        onFocus={() => {
          focused.current = true
        }}
        onBlur={() => {
          focused.current = false
          setDraft(value == null ? '' : String(value))
        }}
        onChange={(e) => {
          const raw = e.target.value
          setDraft(raw)
          onChange(raw === '' ? null : Number(raw))
        }}
        className={baseInput}
        style={inputStyle}
      />
    </label>
  )
}

interface TextAreaFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
}

export function TextAreaField({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: TextAreaFieldProps): React.ReactElement {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Höhe an den Inhalt anpassen, aber nie unter die per `rows` gesetzte Mindesthöhe.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = (): void => {
      el.style.height = 'auto'
      const content = el.scrollHeight
      el.style.height = ''
      const min = el.offsetHeight
      el.style.height = `${Math.max(content, min)}px`
    }
    fit()
    // Beim Breitenwechsel ändert sich der Zeilenumbruch, also neu messen.
    // Nur auf Breite reagieren, sonst löst die eigene Höhenänderung den Observer erneut aus.
    let lastWidth = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return
      lastWidth = el.clientWidth
      fit()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [value, rows])

  return (
    <label className="block">
      <Label>{label}</Label>
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${baseInput} resize-none overflow-hidden`}
        style={inputStyle}
      />
    </label>
  )
}

interface SelectFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  children: ReactNode
}

export function SelectField({ label, value, onChange, children }: SelectFieldProps): React.ReactElement {
  return (
    <label className="block">
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={baseInput}
        style={inputStyle}
      >
        {children}
      </select>
    </label>
  )
}

interface ToggleFieldProps {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}

/** Borderless toggle: a pill that animates a knob via Framer Motion layout. */
export function ToggleField({ label, value, onChange }: ToggleFieldProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-left text-sm focus:outline-none focus-visible:[box-shadow:var(--focus)]"
      style={inputStyle}
    >
      <span style={{ color: 'var(--text)' }}>{label}</span>
      <span
        className="relative flex h-6 w-11 shrink-0 items-center rounded-full p-0.5"
        style={{
          background: value ? 'var(--accent)' : 'color-mix(in srgb, var(--text-muted) 35%, transparent)',
          justifyContent: value ? 'flex-end' : 'flex-start',
        }}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          className="block h-5 w-5 rounded-full"
          style={{ background: 'var(--accent-contrast)', boxShadow: 'var(--shadow)' }}
        />
      </span>
    </button>
  )
}

const SWATCHES = ['#666666', '#000000', '#1d1d1f', '#2d6cdf', '#1f9d6b', '#b06a6a', '#ff7f54']

export function ColorField({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }): React.ReactElement {
  return (
    <label className="block">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-[10px] bg-transparent p-0 focus:outline-none focus-visible:[box-shadow:var(--focus)]"
          aria-label={label}
        />
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className="h-6 w-6 rounded-[6px] focus:outline-none focus-visible:[box-shadow:var(--focus)]"
            style={{ background: c, outline: value.toLowerCase() === c ? '2px solid var(--accent)' : 'none' }}
            aria-label={c}
          />
        ))}
      </div>
    </label>
  )
}
