import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Language } from './types'

/* Which edition the user is browsing. It is an explicit choice, never inferred:
   the EN and JP printings of a card share their artwork, and the recognition work
   (see the repo README) established that they cannot be told apart from it.
   PROJECT_CONTEXT.md section 2 rules out localStorage, so this lives in React state
   and resets with the app. */
const LanguageContext = createContext<{
  language: Language
  setLanguage: (language: Language) => void
}>({ language: 'en', setLanguage: () => {} })

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('en')
  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)

export const LANGUAGE_OPTIONS = [
  { value: 'en' as const, label: 'International' },
  { value: 'jp' as const, label: 'Japon' },
]
