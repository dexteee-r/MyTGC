import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../lib/toast'
import type { Card, WishlistEntry } from '../lib/types'
import { Wishlist } from './Wishlist'

/* Recherchées has two prices per card -- the cote (market_price) and the price
   constaté typed in by hand -- and "trier par prix" was asked to mean the cote,
   the same number the catalogue itself sorts by, never the hand-typed one. */

function entry(id: string, marketPrice: number | null): WishlistEntry {
  const card: Card | null = {
    id, language: 'en', name: id, pack_id: '1', pack_code: null, pack_name: null,
    rarity: null, category: null, colors: [], cost: null, power: null, counter: null,
    attributes: [], types: [], effect: null, trigger: null, release_date: null,
    market_price: marketPrice, image_url: null, printings: [],
  }
  return {
    id: id.length, card_id: id, language: 'en', priority: 1, alert_threshold: null,
    // A hand-typed price deliberately at odds with market_price: if the sort ever
    // regresses to this field instead, the order below would flip and the test
    // would catch it.
    price: marketPrice == null ? null : 100 - marketPrice,
    notes: null, card,
  }
}

function mount(entries: WishlistEntry[]) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, json: async () => entries, text: async () => '',
  }) as Response))

  return render(
    <MemoryRouter>
      <ToastProvider>
        <Wishlist />
      </ToastProvider>
    </MemoryRouter>,
  )
}

const posterNames = () =>
  screen.getAllByRole('button', { name: /^Retirer / }).map((el) => el.getAttribute('aria-label'))

describe('tri par prix sur Recherchées', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('trie sur la cote du marché, pas sur le prix constaté saisi à la main', async () => {
    // Market: OP01-001 at 5, OP01-002 at 20. Constaté (100 - price) runs the other
    // way, so a sort still keyed on the wrong field would reverse this order.
    mount([entry('OP01-001', 5), entry('OP01-002', 20)])
    await screen.findByText('OP01-001')

    fireEvent.click(screen.getByRole('button', { name: /Filtres/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Prix décroissant' }))

    const names = posterNames()
    expect(names[0]).toContain('OP01-002')
    expect(names[1]).toContain('OP01-001')
  })

  it('laisse les cartes sans cote en dernier, dans les deux sens', async () => {
    mount([entry('OP01-001', null), entry('OP01-002', 8)])
    await screen.findByText('OP01-001')
    fireEvent.click(screen.getByRole('button', { name: /Filtres/ }))

    fireEvent.click(await screen.findByRole('button', { name: 'Prix croissant' }))
    expect(posterNames().at(-1)).toContain('OP01-001')

    fireEvent.click(screen.getByRole('button', { name: 'Prix décroissant' }))
    expect(posterNames().at(-1)).toContain('OP01-001')
  })
})
