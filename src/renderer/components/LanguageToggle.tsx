import { motion } from 'framer-motion'
import type { ReactElement } from 'react'
import { t } from '../i18n'
import { LANGUAGES } from '../i18n'
import type { Language } from '../i18n'
import { useLanguage } from '../i18n/LanguageProvider'

const LABELS: Record<Language, string> = { de: 'DE', en: 'EN' }

/**
 * Compact DE/EN toggle. Sits next to the theme switch in the sidebar footer
 * (and in the mobile "more" sheet). The knob slides like the theme toggle, so
 * both labels stay readable at a glance.
 */
export function LanguageToggle(): ReactElement {
  const { lang, setLang } = useLanguage()

  return (
    <div
      role="group"
      aria-label={t.language.label}
      className="relative flex h-7 w-12 shrink-0 items-center rounded-full"
      style={{ background: 'var(--surface-raised)' }}
    >
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute left-px top-[3px] h-[22px] w-[22px] rounded-full"
        style={{ background: 'var(--accent)' }}
        animate={{ x: lang === 'en' ? 24 : 0 }}
        transition={{ type: 'spring', stiffness: 520, damping: 32 }}
      />
      {LANGUAGES.map((language) => {
        const active = lang === language
        return (
          <button
            key={language}
            type="button"
            onClick={() => setLang(language)}
            aria-pressed={active}
            aria-label={LABELS[language]}
            className="relative z-10 flex h-full flex-1 items-center justify-center rounded-full focus:outline-none focus-visible:[box-shadow:var(--focus)]"
          >
            <span
              className="text-[9px] font-semibold tracking-wide"
              style={{ color: active ? 'var(--accent-contrast)' : 'var(--text-muted)' }}
            >
              {LABELS[language]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
