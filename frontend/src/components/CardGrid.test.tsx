import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CollectionProvider } from '../lib/collection'
import type { Card } from '../lib/types'
import { CardTile } from './CardGrid'

/* A card you hold sits in its pocket; a card you do not is an empty pocket with its
   number stamped in the well. Showing the artwork of a card someone does not own —
   dimmed or otherwise — puts a picture of it in their binder, which is the opposite
   of what they came to look at. */

const card: Card = {
  id: 'OP01-001', language: 'en', name: 'Monkey.D.Luffy', pack_id: '569101',
  pack_code: 'OP-01', pack_name: 'ROMANCE DAWN', rarity: 'Leader', category: 'Leader',
  colors: ['Red'], cost: 5, power: 5000, counter: null, attributes: [], types: [],
  effect: null, trigger: null, image_url: '/images/en/OP01-001.png', printings: [],
}

function mount(collection: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      url.includes('/stats')
        ? { distinct_cards: 0, total_quantity: 0, by_language: {}, by_rarity: {}, acquisition_total: 0 }
        : collection,
    text: async () => '',
  } as Response)))

  return render(
    <MemoryRouter>
      <CollectionProvider>
        <CardTile card={card} />
      </CollectionProvider>
    </MemoryRouter>,
  )
}

function held(quantity: number) {
  return [{
    id: 1, card_id: 'OP01-001', language: 'en', quantity, condition: null,
    date_added: '2026-01-01', acquisition_price: null, card: null,
  }]
}

describe('card tile', () => {
  it('leaves an empty pocket for a card that is not held', async () => {
    mount([])
    const link = await screen.findByRole('link')

    expect(link).toHaveAttribute('aria-label', expect.stringContaining('pochette vide'))
    expect(link.querySelector('img')).toBeNull()
    // The slot still says which card belongs there, so the gap is legible.
    expect(screen.getByText('OP01-001')).toBeInTheDocument()
  })

  it('seats the card once it is held', async () => {
    mount(held(1))
    await waitFor(() => expect(screen.getByRole('link').querySelector('img')).not.toBeNull())
    expect(screen.getByRole('link')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('1 en collection'),
    )
  })

  it('stays quiet about a single copy and speaks up about duplicates', async () => {
    /* A "1" on every card you own is noise on a screen whose whole job is showing
       what you own; a "2" is the thing worth knowing. */
    mount(held(1))
    await waitFor(() => expect(screen.getByRole('link').querySelector('img')).not.toBeNull())
    expect(screen.queryByText('×1')).toBeNull()

    mount(held(3))
    await waitFor(() => expect(screen.getAllByText('×3').length).toBeGreaterThan(0))
  })

  it('links to the right edition', async () => {
    mount([])
    // Losing the language turns a Japanese card into its English twin on the way to
    // the detail screen.
    expect(await screen.findByRole('link')).toHaveAttribute(
      'href',
      '/card/OP01-001?language=en',
    )
  })
})
