import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api } from './api'
import type { Card, Language, WishlistEntry } from './types'

/* Held for the whole session, same reasoning as CollectionProvider: "is this card
   already wanted" has to be checkable on every tile of a 9,447-card grid, and a
   personal want list is small enough to just keep in memory.

   This used to be Wishlist.tsx's own local state, fetched fresh every time that
   screen mounted -- fine for that screen alone, but it meant nowhere else in the app
   knew what was already on the list. The quick "add to wishlist" button on a search
   tile tracked only its own click in a `useState`, reset to false on every remount, so
   a card already wanted showed the same bare button as one that was not -- and
   POST /wishlist treats a second add as an edit: clicking it again silently reset
   whatever priority, price and notes were already set on that entry. Centralising the
   list is what lets a tile ask the real question instead of only remembering its own
   click. */

const DEFAULT_PRIORITY = 2

interface WishlistState {
  ready: boolean
  entries: WishlistEntry[]
  wantedOf: (cardId: string, language: Language) => WishlistEntry | null
  add: (card: Pick<Card, 'id' | 'language'>) => Promise<void>
  remove: (entryId: number) => Promise<void>
  patch: (
    entryId: number,
    change: { priority?: number; price?: number | null; notes?: string | null },
  ) => Promise<void>
  reload: () => Promise<void>
}

const Ctx = createContext<WishlistState | null>(null)

export function WishlistProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<WishlistEntry[]>([])
  const [ready, setReady] = useState(false)

  const reload = useCallback(async () => {
    const list = await api.wishlist()
    setEntries(list)
    setReady(true)
  }, [])

  useEffect(() => {
    reload().catch(() => setReady(true))
  }, [reload])

  const index = useMemo(() => {
    const byCard = new Map<string, WishlistEntry>()
    for (const entry of entries) byCard.set(`${entry.language}:${entry.card_id}`, entry)
    return byCard
  }, [entries])

  const wantedOf = useCallback(
    (cardId: string, language: Language) => index.get(`${language}:${cardId}`) ?? null,
    [index],
  )

  const add = useCallback(
    async (card: Pick<Card, 'id' | 'language'>) => {
      if (index.has(`${card.language}:${card.id}`)) return
      const optimistic: WishlistEntry = {
        id: -Date.now(),
        card_id: card.id,
        language: card.language,
        priority: DEFAULT_PRIORITY,
        alert_threshold: null,
        price: null,
        notes: null,
        card: null,
      }
      setEntries((current) => [optimistic, ...current])
      try {
        await api.addToWishlist({ card_id: card.id, language: card.language })
        await reload()
      } catch (error) {
        setEntries((current) => current.filter((e) => e.id !== optimistic.id))
        throw error
      }
    },
    [index, reload],
  )

  const remove = useCallback(
    async (entryId: number) => {
      const previous = entries
      setEntries((current) => current.filter((e) => e.id !== entryId))
      try {
        await api.removeFromWishlist(entryId)
      } catch (error) {
        setEntries(previous)
        throw error
      }
    },
    [entries],
  )

  const patch = useCallback(
    async (
      entryId: number,
      change: { priority?: number; price?: number | null; notes?: string | null },
    ) => {
      setEntries((current) => current.map((e) => (e.id === entryId ? { ...e, ...change } : e)))
      await api.updateWishlist(entryId, change).catch(reload)
    },
    [reload],
  )

  const value: WishlistState = { ready, entries, wantedOf, add, remove, patch, reload }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useWishlist(): WishlistState {
  const value = useContext(Ctx)
  if (!value) throw new Error('useWishlist must be used inside WishlistProvider')
  return value
}
