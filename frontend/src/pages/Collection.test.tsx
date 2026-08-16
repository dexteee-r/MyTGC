import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../lib/auth'
import { CollectionProvider } from '../lib/collection'
import { LanguageProvider } from '../lib/language'
import { ToastProvider } from '../lib/toast'
import type { Card, CollectionEntry, CollectionStats } from '../lib/types'
import { Collection } from './Collection'

/* The shelf shows what it is worth. The figure never covers the whole binder — the
   Japanese printing has no price feed and some alternate arts are deliberately
   uncosted — so the coverage line is what stops a partial total from reading as an
   appraisal. It is a conditional, which is exactly the kind of thing that rots
   silently once the happy path looks right. */

function entry(
  id: string, language: 'en' | 'jp', quantity: number, marketPrice: number | null = null,
): CollectionEntry {
  const card: Card | null = marketPrice === null ? null : {
    id, language, name: id, pack_id: '1', pack_code: null, pack_name: null,
    rarity: null, category: null, colors: [], cost: null, power: null, counter: null,
    attributes: [], types: [], effect: null, trigger: null, release_date: null,
    market_price: marketPrice, image_url: null, printings: [],
  }
  return {
    id: id.length + quantity, card_id: id, language, quantity, condition: null,
    date_added: '2026-01-01', acquisition_price: null, notes: null, card,
  }
}

function stats(over: Partial<CollectionStats> = {}): CollectionStats {
  return {
    distinct_cards: 2, total_quantity: 2, by_language: {}, by_rarity: {},
    acquisition_total: 0, market_total: 30.47, market_priced: 2,
    market_currency: 'EUR', ...over,
  }
}

function mount(entries: CollectionEntry[], figures: CollectionStats) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (url.includes('/collection/stats') ? figures : entries),
    text: async () => '',
  }) as Response))

  return render(
    <MemoryRouter>
      <AuthProvider>
        <LanguageProvider>
          <CollectionProvider>
            <ToastProvider>
              <Collection />
            </ToastProvider>
          </CollectionProvider>
        </LanguageProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('la valeur sur la page collection', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('affiche le total', async () => {
    mount([entry('OP01-001', 'en', 2)], stats())
    expect(await screen.findByText('30,47 €')).toBeTruthy()
  })

  it('ne montre pas de ligne de couverture quand tout est coté', async () => {
    mount([entry('OP01-001', 'en', 2)], stats())
    await screen.findByText('30,47 €')
    expect(screen.queryByText(/sur .* cotées/)).toBeNull()
  })

  it('dit combien de cartes sont cotées quand une partie ne l’est pas', async () => {
    mount(
      [entry('OP01-001', 'en', 2), entry('OP01-001', 'jp', 3)],
      stats({ total_quantity: 5, distinct_cards: 3 }),
    )
    await screen.findByText('30,47 €')
    expect(screen.getByText('2 sur 5 cotées')).toBeTruthy()
  })

  it('ne montre pas un total de zéro euro quand rien n’est coté', async () => {
    /* 0 € would be a claim about the market; it is the absence of one. */
    mount([entry('OP01-001', 'jp', 3)], stats({ market_total: 0, market_priced: 0 }))
    await waitFor(() => expect(screen.getByText('aucune carte cotée')).toBeTruthy())
    expect(screen.queryByText('0 €')).toBeNull()
  })
})

/* Doubles: everything held more than once, with two figures — what the stack is
   worth, and what is left to trade once one copy of each stays in the binder.
   Computed on the client from entries already loaded for every screen; nothing
   here touches the server. */
describe('la vue doubles', () => {
  beforeEach(() => vi.unstubAllGlobals())

  const openDoubles = async () => {
    fireEvent.click(await screen.findByRole('tab', { name: 'Doubles' }))
  }

  it('ne compte jamais l’exemplaire qu’on garde', async () => {
    /* The one figure the whole feature exists to get right: three copies at 9,20 €
       is 27,60 € held and 18,40 € tradeable — two copies, not three. */
    mount([entry('OP01-001', 'en', 3, 9.2)], stats())
    await openDoubles()
    expect(await screen.findByText('27,60 €')).toBeTruthy()
    expect(screen.getByText('18,40 €')).toBeTruthy()
  })

  it('exclut les exemplaires uniques du total et du décompte', async () => {
    mount(
      [entry('OP01-001', 'en', 1, 10), entry('OP01-002', 'en', 2, 5)],
      stats(),
    )
    await openDoubles()
    // 2× at 5 € : 10 € held, 5 € tradeable. The single at 10 € plays no part.
    expect(await screen.findByText('10 €')).toBeTruthy()
    expect(screen.getByText('5 €')).toBeTruthy()
  })

  it('affiche combien de doubles sont cotés quand une partie ne l’est pas', async () => {
    mount(
      [entry('OP01-001', 'en', 2, 5), entry('OP01-002', 'en', 2, null)],
      stats(),
    )
    await openDoubles()
    await screen.findByText('10 €')
    expect(screen.getByText('1 sur 2 cotées')).toBeTruthy()
  })

  it('ne montre pas de ligne de couverture quand tous les doubles sont cotés', async () => {
    mount([entry('OP01-001', 'en', 2, 5)], stats())
    await openDoubles()
    await screen.findByText('10 €')
    expect(screen.queryByText(/sur .* cotées/)).toBeNull()
  })

  it('le dit plutôt que d’afficher zéro quand aucun double n’est coté', async () => {
    mount([entry('OP01-001', 'en', 2, null)], stats())
    await openDoubles()
    expect(await screen.findByText("Aucun double coté pour l'instant.")).toBeTruthy()
    expect(screen.queryByText('0 €')).toBeNull()
  })

  it('distingue une collection sans double d’une collection vide', async () => {
    mount([entry('OP01-001', 'en', 1, 10)], stats({ total_quantity: 1, distinct_cards: 1 }))
    await openDoubles()
    expect(await screen.findByText("Aucun double pour l'instant")).toBeTruthy()
  })
})
