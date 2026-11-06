import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { getLanguage, setActiveLanguage } from './index'
import type { Language } from './index'

interface LanguageContextValue {
  lang: Language
  setLang: (language: Language) => void
}

const Ctx = createContext<LanguageContextValue>({
  lang: 'de',
  setLang: () => {},
})

export const useLanguage = (): LanguageContextValue => useContext(Ctx)

const STORAGE_KEY = 'hustl.lang'

export function LanguageProvider({ children }: { children: ReactNode }): ReactNode {
  const [lang, setLangState] = useState<Language>(() => getLanguage())

  const setLang = useCallback((next: Language): void => {
    // Update the module-level dictionary before React renders the new tree,
    // so every `t.*` lookup already sees the new language.
    setActiveLanguage(next)
    setLangState(next)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // Private mode / blocked storage: the language still applies for this session.
    }
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
