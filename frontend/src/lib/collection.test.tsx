import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CollectionProvider, useCollection } from './collection'

/* The collection is held in memory and written optimistically, which is what makes
   emptying a binder feel instant. These tests cover the part that is easy to get
   subtly wrong: what the screen shows between the tap and the server's answer. */

const CARD = { id: 'OP01-001', language: 'en' as const }

function mockApi(handlers: Record<string, (init?: RequestInit) => unknown>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace('/api', '').split('?')[0]
    const key = `${init?.method ?? 'GET'} ${path}`
    const handler = handlers[key]
    if (!handler) throw new Error(`unexpected call: ${key}`)
    const body = handler(init)
    return {
      ok: true,
      status: body === undefined ? 204 : 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response
  })
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <CollectionProvider>{children}</CollectionProvider>
)

const EMPTY = {
  'GET /collection': () => [],
  'GET /collection/stats': () => ({
    distinct_cards: 0, total_quantity: 0, by_language: {}, by_rarity: {},
    acquisition_total: 0,
  }),
}

describe('collection', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockApi(EMPTY))
  })

  it('reports a card as not owned until it is added', async () => {
    const { result } = renderHook(() => useCollection(), { wrapper })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.ownedOf('OP01-001', 'en')).toBeNull()
  })

  it('shows the card as owned before the server has answered', async () => {
    let resolveAdd: (value: unknown) => void = () => {}
    const slowAdd = new Promise((resolve) => {
      resolveAdd = resolve
    })

    vi.stubGlobal(
      'fetch',
      mockApi({
        ...EMPTY,
        'POST /collection': () => {
          // Never settles during the assertion below, so what we observe is
          // genuinely the optimistic state and not a fast round trip.
          void slowAdd
          return { id: 1 }
        },
      }),
    )

    const { result } = renderHook(() => useCollection(), { wrapper })
    await waitFor(() => expect(result.current.ready).toBe(true))

    act(() => {
      void result.current.add(CARD)
    })

    await waitFor(() =>
      expect(result.current.ownedOf('OP01-001', 'en')?.quantity).toBe(1),
    )
    resolveAdd(null)
  })

  it('puts the card back when the server refuses the add', async () => {
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const path = url.replace('/api', '').split('?')[0]
      if (init?.method === 'POST' && path === '/collection') {
        return { ok: false, status: 404, text: async () => 'nope' } as Response
      }
      return mockApi(EMPTY)(url, init)
    })

    const { result } = renderHook(() => useCollection(), { wrapper })
    await waitFor(() => expect(result.current.ready).toBe(true))

    await act(async () => {
      await result.current.add(CARD).catch(() => {})
    })

    // A rollback that never happens leaves a card in the list that the server has
    // never heard of, and the next reload silently makes it vanish.
    expect(result.current.ownedOf('OP01-001', 'en')).toBeNull()
  })

  it('counts every printing of a card number together', async () => {
    vi.stubGlobal(
      'fetch',
      mockApi({
        ...EMPTY,
        'GET /collection': () => [
          { id: 1, card_id: 'OP01-001', language: 'en', quantity: 2, condition: null,
            date_added: '2026-01-01', acquisition_price: null, card: null },
          { id: 2, card_id: 'OP01-001_p1', language: 'en', quantity: 1, condition: null,
            date_added: '2026-01-01', acquisition_price: null, card: null },
        ],
      }),
    )

    const { result } = renderHook(() => useCollection(), { wrapper })
    await waitFor(() => expect(result.current.ready).toBe(true))

    // Alt arts share the printed card number, so a set's progress counts them as
    // one card the collector owns.
    expect(result.current.ownedCountOfNumber('OP01-001', 'en')).toBe(3)
    expect(result.current.ownedCountOfNumber('OP01-001', 'jp')).toBe(0)
  })
})
