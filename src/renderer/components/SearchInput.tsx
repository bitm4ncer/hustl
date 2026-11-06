import { Icon } from './Icon'

interface SearchInputProps {
  value: string
  onChange: (v: string) => void
  placeholder: string
  ariaLabel: string
}

/**
 * Slim, borderless search box. Sits in a list-page header to the left of the
 * primary action. Magnifier glyph on the left, muted placeholder, `--field`
 * background — discreet by design (no border, no shadow).
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: SearchInputProps): React.ReactElement {
  return (
    <div
      className="flex items-center gap-2 rounded-[10px] px-3 py-2"
      style={{ background: 'var(--field)', width: 260 }}
    >
      <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>
        <Icon name="search" size={16} />
      </span>
      <input
        type="search"
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent text-sm focus:outline-none"
        style={{ color: 'var(--text)' }}
      />
    </div>
  )
}
