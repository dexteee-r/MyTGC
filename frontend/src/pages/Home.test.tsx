import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../lib/auth'
import { CollectionProvider } from '../lib/collection'
import type { Pack, UserProfile } from '../lib/types'
import { Home } from './Home'

/* A first launch shows "Classeur vide" with its own "Scanner une carte" button —
   and until this fix, the page's own persistent CTA rendered right under it,
   the same button twice in a row with nothing between them. Only that
   regression is under test here. */

function mount(packs: Pack[], user: Partial<UserProfile> | null = null) {
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
      // AuthProvider boots by asking /auth/refresh; a signed-in test supplies a
      // profile here rather than through the sign-in form, which this page
      // never renders.
      if (url.includes('/auth/refresh') && user) {
        return {
          ok: true, status: 200, text: async () => '',
          json: async () => ({
            access_token: 'test', token_type: 'bearer', expires_in: 900,
            refresh_token: 'test',
            user: {
              id: 1, email: 'a@example.com', display_name: null, created_at: null,
              default_language: 'en', grid_columns: 2,
              goal_pack_code: null, goal_language: null, ...user,
            },
          }),
        } as Response
      }
      // /auth/refresh with no user, and /health: unused by these tests either way.
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

describe('l’objectif du Classeur sur un set Promos', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('retrouve le set choisi par pack_id quand il n’a pas de pack_code imprimé', async () => {
    /* The Promos anomaly (BACKLOG.md): those sets have no printed code, so
       goal_pack_code holds a pack_id instead (see Packs.tsx) -- matching the
       goal by pack_code alone would never find it again. */
    mount(
      [pack({ pack_id: '569901', pack_code: null, pack_name: 'Promotion card' })],
      { goal_pack_code: '569901', goal_language: 'en' },
    )
    expect(await screen.findByText('Objectif')).toBeTruthy()
    expect(screen.getByText('Promotion card')).toBeTruthy()
  })
})
