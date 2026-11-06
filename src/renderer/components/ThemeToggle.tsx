import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from '../theme/ThemeProvider'
import { t } from '../i18n'
import { Icon } from './Icon'

/**
 * Hell/Dunkel pill slider. The knob position reflects the *resolved* theme
 * (knob right when the `dark` class is on <html>) — so the default 'system'
 * setting shows whichever side the OS resolves to. Clicking sets an EXPLICIT
 * 'light' or 'dark' (opposite of the currently resolved mode); the underlying
 * 'system' capability in ThemeProvider stays intact, it's just no longer the
 * active choice once the user flips the slider.
 */
export function ThemeToggle(): ReactElement {
  const { setTheme } = useTheme()
  const [isDark, setIsDark] = useState<boolean>(() =>
    document.documentElement.classList.contains('dark')
  )

  // Mirror the resolved theme: ThemeProvider toggles the `dark` class on <html>
  // (for explicit choices and live system changes); observe it so the knob and
  // label always match what's actually on screen.
  useEffect(() => {
    const root = document.documentElement
    const sync = (): void => setIsDark(root.classList.contains('dark'))
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  const toggle = (): void => setTheme(isDark ? 'light' : 'dark')

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={isDark}
      aria-label={t.settings.theme}
      className="flex w-full items-center justify-between gap-1 rounded-[12px] px-1 py-2 focus:outline-none focus-visible:[box-shadow:var(--focus)]"
    >
      <span className="truncate text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        {isDark ? t.settings.dark : t.settings.light}
      </span>

      <span
        className="relative flex h-7 w-[54px] shrink-0 items-center rounded-full px-1"
        style={{ background: 'var(--surface-raised)' }}
      >
        {/* Faint sun (left) / moon (right) hints inside the track */}
        <span
          className="pointer-events-none absolute left-1.5 flex items-center"
          style={{ color: 'var(--text-muted)', opacity: isDark ? 0.4 : 0 }}
        >
          <Icon name="sun" size={13} />
        </span>
        <span
          className="pointer-events-none absolute right-1.5 flex items-center"
          style={{ color: 'var(--text-muted)', opacity: isDark ? 0 : 0.4 }}
        >
          <Icon name="moon" size={13} />
        </span>

        {/* Sliding knob */}
        <motion.span
          className="relative z-10 flex h-[22px] w-[22px] items-center justify-center rounded-full"
          style={{ background: 'var(--accent)', color: 'var(--accent-contrast)' }}
          animate={{ x: isDark ? 24 : 0 }}
          transition={{ type: 'spring', stiffness: 520, damping: 30 }}
        >
          <Icon name={isDark ? 'moon' : 'sun'} size={13} />
        </motion.span>
      </span>
    </button>
  )
}
