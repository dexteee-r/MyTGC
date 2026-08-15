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
import type { Card, CollectionEntry, CollectionStats, Condition, Language } from './types'

/* The collection is held in memory for the whole session.
   Two reasons, both about how the app is actually used:

   1. Ownership has to be visible on every tile in a 9,447-card grid. Asking the
      server per tile is impossible; asking once is trivial, because a personal
      collection is small.
   2. Emptying a binder means dozens of writes in a row. Every mutation is applied
      optimistically and reconciled afterwards, so the count moves under the thumb
      instead of after a round trip. */

interface Owned {
  entryId: number
  quantity: number
  condition: Condition | null
  acquisitionPrice: number | null
}

interface CollectionState {
  ready: boolean
  entries: CollectionEntry[]
  stats: CollectionStats | null
  ownedOf: (cardId: string, language: Language) => Owned | null
  ownedCountOfNumber: (cardNumber: string, language: Language) => number
  add: (card: Pick<Card, 'id' | 'language'>, condition?: Condition | null) => Promise<void>
  setQuantity: (cardId: string, language: Language, quantity: number) => Promise<void>
  setPrice: (cardId: string, language: Language, price: number | null) => Promise<void>
  setCondition: (cardId: string, language: Language, condition: Condition) => Promise<void>
  reload: () => Promise<void>
}

const Ctx = createContext<CollectionState | null>(null)

export function CollectionProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<CollectionEntry[]>([])
  const [stats, setStats] = useState<CollectionStats | null>(null)
  const [ready, setReady] = useState(false)

  const reload = useCallback(async () => {
    const [list, s] = await Promise.all([api.collection(), api.collectionStats()])
    setEntries(list)
    setStats(s)
    setReady(true)
  }, [])

  useEffect(() => {
    reload().catch(() => setReady(true))
  }, [reload])

  const index = useMemo(() => {
    const byCard = new Map<string, Owned>()
    const byNumber = new Map<string, number>()
    for (const entry of entries) {
      byCard.set(`${entry.language}:${entry.card_id}`, {
        entryId: entry.id,
        quantity: entry.quantity,
        condition: entry.condition,
        acquisitionPrice: entry.acquisition_price,
      })
      const key = `${entry.language}:${entry.card_id.split('_')[0]}`
      byNumber.set(key, (byNumber.get(key) ?? 0) + entry.quantity)
    }
    return { byCard, byNumber }
  }, [entries])

  const ownedOf = useCallback(
    (cardId: string, language: Language) => index.byCard.get(`${language}:${cardId}`) ?? null,
    [index],
  )

  const ownedCountOfNumber = useCallback(
    (cardNumber: string, language: Language) =>
      index.byNumber.get(`${language}:${cardNumber}`) ?? 0,
    [index],
  )

  const add = useCallback(
    async (card: Pick<Card, 'id' | 'language'>, condition: Condition | null = null) => {
      const existing = index.byCard.get(`${card.language}:${card.id}`)
      if (existing) {
        await setQuantity(card.id, card.language, existing.quantity + 1)
        return
      }
      // Optimistic placeholder with a negative id, replaced when the server answers.
      const optimistic: CollectionEntry = {
        id: -Date.now(),
        card_id: card.id,
        language: card.language,
        quantity: 1,
        condition,
        date_added: new Date().toISOString().slice(0, 10),
        acquisition_price: null,
        card: null,
      }
      setEntries((current) => [optimistic, ...current])
      try {
        await api.addToCollection({
          card_id: card.id,
          language: card.language,
          quantity: 1,
          condition,
        })
        await reload()
      } catch (error) {
        setEntries((current) => current.filter((e) => e.id !== optimistic.id))
        throw error
      }
    },
    // setQuantity is defined below and stable for the lifetime of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, reload],
  )

  const setQuantity = useCallback(
    async (cardId: string, language: Language, quantity: number) => {
      const key = `${language}:${cardId}`
      const existing = index.byCard.get(key)
      if (!existing) return

      const previous = entries
      setEntries((current) =>
        quantity <= 0
          ? current.filter((e) => e.id !== existing.entryId)
          : current.map((e) => (e.id === existing.entryId ? { ...e, quantity } : e)),
      )
      try {
        if (quantity <= 0) await api.removeFromCollection(existing.entryId)
        else await api.updateCollection(existing.entryId, { quantity })
        await reload()
      } catch {
        setEntries(previous)
      }
    },
    [entries, index, reload],
  )

  const setPrice = useCallback(
    async (cardId: string, language: Language, price: number | null) => {
      const key = `${language}:${cardId}`
      const existing = index.byCard.get(key)
      if (!existing) return

      const previous = entries
      setEntries((current) =>
        current.map((e) => (e.id === existing.entryId ? { ...e, acquisition_price: price } : e)),
      )
      try {
        await api.updateCollection(existing.entryId, { acquisition_price: price })
        await reload()
      } catch {
        setEntries(previous)
      }
    },
    [entries, index, reload],
  )

  /* The card screen sets this after the fact now: its condition picker used to sit
     on the add button, and the add button is gone. Without this the state of a
     holding could never be corrected once it was filed. */
  const setCondition = useCallback(
    async (cardId: string, language: Language, condition: Condition) => {
      const existing = index.byCard.get(`${language}:${cardId}`)
      if (!existing) return

      const previous = entries
      setEntries((current) =>
        current.map((e) => (e.id === existing.entryId ? { ...e, condition } : e)),
      )
      try {
        await api.updateCollection(existing.entryId, { condition })
        await reload()
      } catch {
        setEntries(previous)
      }
    },
    [entries, index, reload],
  )

  const value: CollectionState = {
    ready,
    entries,
    stats,
    ownedOf,
    ownedCountOfNumber,
    add,
    setQuantity,
    setPrice,
    setCondition,
    reload,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useCollection(): CollectionState {
  const value = useContext(Ctx)
  if (!value) throw new Error('useCollection must be used inside CollectionProvider')
  return value
}
