import { createContext, useContext, useState, type ReactNode } from 'react'
import { Edition } from '../components/Edition'
import { api } from './api'
import { useAuth } from './auth'
import type { Language } from './types'

/* Which edition the user is browsing. It is an explicit choice, never inferred:
   the EN and JP printings of a card share their artwork, and the recognition work
   (see the repo README) established that they cannot be told apart from it.

   It is remembered on the account rather than in the browser: PROJECT_CONTEXT.md
   section 2 rules out localStorage, and a choice that reset to English on every
   reload was wrong every single time for a collection that is mostly Japanese. The
   write is fire-and-forget — the switch has already moved on screen, and a failed
   PATCH should cost the next reload, not this tap. */
const LanguageContext = createContext<{
  language: Language
  setLanguage: (language: Language) => void
}>({ language: 'en', setLanguage: () => {} })

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [language, setLanguage] = useState<Language>(user?.default_language ?? 'en')

  const choose = (next: Language) => {
    setLanguage(next)
    api.updateProfile({ default_language: next }).catch(() => {})
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage: choose }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)

/* The Japanese edition carries its flag wherever it is named. The two editions are
   otherwise indistinguishable on screen — same artwork, same everything — so the
   mark is the fastest way to tell which one you are looking at. */
export const LANGUAGE_OPTIONS = [
  { value: 'en' as const, label: <Edition language="en" /> },
  { value: 'jp' as const, label: <Edition language="jp" /> },
]
