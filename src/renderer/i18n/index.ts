import { de } from './de'
import type { Dictionary } from './de'
import { en } from './en'

export type Language = 'de' | 'en'

export const LANGUAGES: Language[] = ['de', 'en']

const dictionaries: Record<Language, Dictionary> = { de, en }

const STORAGE_KEY = 'hustl.lang'

function readStoredLanguage(): Language {
  try {
    if (typeof localStorage === 'undefined') return 'de'
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'de'
  } catch {
    return 'de'
  }
}

let current: Language = readStoredLanguage()

export function getLanguage(): Language {
  return current
}

/** Sets the language read by `t` and the formatting helpers. */
export function setActiveLanguage(language: Language): void {
  current = language
}

export function dictionaryFor(language: Language = current): Dictionary {
  return dictionaries[language]
}

/**
 * Live dictionary. The object is a proxy, so every existing `t.section.key`
 * call site reads the currently active language without subscribing to React.
 * `LanguageProvider` re-renders the tree when the language changes.
 */
export const t: Dictionary = new Proxy({} as Dictionary, {
  get(_target, property) {
    return (dictionaries[current] as unknown as Record<string | symbol, unknown>)[property]
  },
})

export { de, en }
export type { Dictionary }
