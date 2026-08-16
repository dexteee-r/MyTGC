import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../lib/auth'
import { CollectionProvider } from '../lib/collection'
import type { Pack } from '../lib/types'
import { Home } from './Home'

/* A first launch shows "Classeur vide" with its own "Scanner une carte" button —
   and until this fix, the page's own persistent CTA rendered right under it,
   the same button twice in a row with nothing between them. Only that
   regression is under test here. */

function mount(packs: Pack[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/packs')) {
        return { ok: true, status: 200, json: async () => packs, text: async () => '' } as Response
      }
      if (url.includes('/collection/stats')) {
        return {
          ok: true, status: 200, text: async () => '',
          json: async () => ({
            distinct_cards: 0, total_quantity: 0, by_language: {}, by_rarity: {},
            acquisition_total: 0, market_total: 0, market_priced: 0, market_currency: 'EUR',
          }),
        } as Response
      }
      if (url.includes('/collection')) {
        return { ok: true, status: 200, json: async () => [], text: async () => '' } as Response
      }
      // /auth/refresh and /health: unused by these tests either way.
      return { ok: false, status: 401, text: async () => '', json: async () => ({}) } as Response
    }),
  )

  return render(
    <MemoryRouter>
      <AuthProvider>
        <CollectionProvider>
          <Home />
        </CollectionProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

function pack(over: Partial<Pack> = {}): Pack {
  return {
    pack_id: '1', language: 'en', pack_code: 'OP-01', pack_name: 'ROMANCE DAWN',
    card_count: 121, owned_count: 0, ...over,
  }
}

describe('premier lancement du Classeur', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('un seul bouton "Scanner une carte" quand le classeur est entièrement vide', async () => {
    mount([pack()])
    await screen.findByText('Classeur vide')
    expect(screen.getAllByText('Scanner une carte')).toHaveLength(1)
  })

  it('le bouton de bas de page reste présent une fois des intercalaires entamés', async () => {
    mount([pack({ owned_count: 5 })])
    await screen.findByText('ROMANCE DAWN')
    expect(screen.queryByText('Classeur vide')).toBeNull()
    expect(screen.getAllByText('Scanner une carte')).toHaveLength(1)
  })
})
