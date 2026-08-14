import { useCallback, useEffect, useState } from 'react'
import { api } from './api'

/* Recent searches, kept on the account. In React state alone the list emptied on every
   reload, which is not a history — and localStorage is ruled out by the contract, so
   the server holds it.

   The list is set optimistically and the server's answer replaces it: it is the one
   that knows the order and the cap, and the round trip should not be felt while
   typing. */
export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>([])

  useEffect(() => {
    api.searchHistory().then(setHistory).catch(() => {})
  }, [])

  const addSearch = useCallback((query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return
    setHistory((prev) => [trimmed, ...prev.filter((q) => q !== trimmed)].slice(0, 8))
    api.addSearchHistory(trimmed).then(setHistory).catch(() => {})
  }, [])

  const clear = useCallback(() => {
    setHistory([])
    api.clearSearchHistory().catch(() => {})
  }, [])

  return { history, setHistory, addSearch, clear }
}
