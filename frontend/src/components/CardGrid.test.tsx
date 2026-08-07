import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CollectionProvider } from '../lib/collection'
import type { Card } from '../lib/types'
import { CardTile } from './CardGrid'

/* Ownership on the tile is the thing that turns a catalogue into a collection
   tracker: browsing a set has to answer "what am I missing" at a glance. */

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

describe('card tile', () => {
  it('marks a card that is not owned', async () => {
    mount([])
    const link = await screen.findByRole('link')
    expect(link).toHaveAttribute('aria-label', expect.stringContaining('non possédée'))
    // Dimmed rather than hidden: the set still reads as a whole.
    expect(link.querySelector('img')?.className).toContain('opacity-45')
  })

  it('shows how many copies are held', async () => {
    mount([
      { id: 1, card_id: 'OP01-001', language: 'en', quantity: 3, condition: null,
        date_added: '2026-01-01', acquisition_price: null, card: null },
    ])

    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('aria-label', expect.stringContaining('3 en collection'))
    expect(link.querySelector('img')?.className).not.toContain('opacity-45')
  })

  it('links to the right edition', async () => {
    mount([])
    const link = await screen.findByRole('link')
    // Losing the language turns a Japanese card into its English twin on the way
    // to the detail screen.
    expect(link).toHaveAttribute('href', '/card/OP01-001?language=en')
  })
})
