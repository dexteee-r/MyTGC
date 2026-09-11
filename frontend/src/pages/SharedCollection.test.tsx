import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Card, SharedCollectionEntry } from '../lib/types'
import { SharedCollection } from './SharedCollection'

/* A stranger looking at someone else's binder through a link -- no account, so this
   never reuses the owner's own Collection screen or its "Doubles" state, only the
   same idea (quantity > 1) applied to data that arrived already public. */

function entry(id: string, quantity: number): SharedCollectionEntry {
  const card: Card = {
    id, language: 'en', name: id, pack_id: '1', pack_code: null, pack_name: null,
    rarity: null, category: null, colors: [], cost: null, power: null, counter: null,
    attributes: [], types: [], effect: null, trigger: null, release_date: null,
    market_price: null, image_url: null, printings: [],
  }
  return { card_id: id, language: 'en', quantity, condition: null, card }
}

function mount(entries: SharedCollectionEntry[], ownerName: string | null = 'Robin') {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ owner_name: ownerName, entries }),
    text: async () => '',
  } as Response)))

  return render(
    <MemoryRouter initialEntries={['/shared/collection/abc123']}>
      <Routes>
        <Route path="/shared/collection/:token" element={<SharedCollection />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('collection partagée', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('affiche tout par défaut', async () => {
    mount([entry('OP01-001', 1), entry('OP01-002', 3)])
    expect(await screen.findByText('Collection de Robin')).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('filtre sur les doubles au clic', async () => {
    mount([entry('OP01-001', 1), entry('OP01-002', 3), entry('OP01-003', 2)])
    await screen.findByText('Collection de Robin')

    fireEvent.click(screen.getByRole('tab', { name: /Doubles/ }))
    // The single copy (OP01-001, ×1) must be gone; both the ×3 and the ×2 stay.
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('dit qu’il n’y a aucun double plutôt que de vider silencieusement la grille', async () => {
    mount([entry('OP01-001', 1)])
    await screen.findByText('Collection de Robin')

    fireEvent.click(screen.getByRole('tab', { name: /Doubles/ }))
    expect(await screen.findByText("Aucun double pour l'instant.")).toBeTruthy()
  })

  it('le compteur du badge Doubles reflète le vrai nombre, pas juste "présent"', async () => {
    mount([entry('OP01-001', 1), entry('OP01-002', 3), entry('OP01-003', 2)])
    await screen.findByText('Collection de Robin')
    expect(screen.getByRole('tab', { name: /Doubles/ })).toHaveTextContent('2')
  })
})
