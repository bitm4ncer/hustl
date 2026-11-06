import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { t } from '../i18n'
import { useLanguage } from '../i18n/LanguageProvider'

/** Zeigt einen Hinweis, sobald das Gerät offline ist. Die App cached keine
 *  Finanzdaten, deshalb ist der ehrliche Zustand „nicht verfügbar". */
export function OfflineBanner(): ReactElement | null {
  const { lang } = useLanguage()
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  )

  useEffect(() => {
    const goOffline = (): void => setOffline(true)
    const goOnline = (): void => setOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      role="status"
      data-lang={lang}
      className="fixed inset-x-0 top-0 z-[60] px-4 py-2 text-center text-xs font-medium safe-top"
      style={{ background: 'var(--danger, #e5484d)', color: '#fff' }}
    >
      {t.app.offline}
    </div>
  )
}
