import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Card, SharedCollectionEntry } from '../lib/types'
import { SharedCollection } from './SharedCollection'

/* A stranger looking at someone else's binder through a link -- no account, so this
   never reuses the owner's own Collection screen or its state, only the same ideas
   (doubles, extension, value, rarity, date) applied to data that arrived already
   public and already whole -- there is no server round trip to filter against. */

function entry(
  id: string,
  over: {
    quantity?: number
    language?: 'en' | 'jp'
    packCode?: string | null
    rarity?: string | null
    marketPrice?: number | null
    dateAdded?: string
  } = {},
): SharedCollectionEntry {
  const card: Card = {
    id, language: over.language ?? 'en', name: id, pack_id: '1',
    pack_code: over.packCode ?? null, pack_name: over.packCode ? `Extension ${over.packCode}` : null,
    rarity: over.rarity ?? null, category: null, colors: [], cost: null, power: null,
    counter: null, attributes: [], types: [], effect: null, trigger: null,
    release_date: null, market_price: over.marketPrice ?? null,
    image_url: `/images/en/${id}.png`, artist: null, printings: [],
  }
  return {
    card_id: id, language: over.language ?? 'en', quantity: over.quantity ?? 1,
    condition: null, date_added: over.dateAdded ?? '2026-01-01', card,
  }
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

const openFilters = async () => {
  fireEvent.click(await screen.findByLabelText(/^Filtres/))
}

describe('collection partagée', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('affiche tout par défaut', async () => {
    mount([entry('OP01-001', { quantity: 1 }), entry('OP01-002', { quantity: 3 })])
    expect(await screen.findByText('Collection de Robin')).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('filtre sur les doubles au clic', async () => {
    mount([
      entry('OP01-001', { quantity: 1 }),
      entry('OP01-002', { quantity: 3 }),
      entry('OP01-003', { quantity: 2 }),
    ])
    await screen.findByText('Collection de Robin')

    fireEvent.click(screen.getByRole('tab', { name: /Doubles/ }))
    // The single copy (OP01-001, ×1) must be gone; both the ×3 and the ×2 stay.
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('dit qu’il n’y a aucun double plutôt que de vider silencieusement la grille', async () => {
    mount([entry('OP01-001', { quantity: 1 })])
    await screen.findByText('Collection de Robin')

    fireEvent.click(screen.getByRole('tab', { name: /Doubles/ }))
    expect(await screen.findByText("Aucun double pour l'instant.")).toBeTruthy()
  })

  it('le compteur du badge Doubles reflète le vrai nombre, pas juste "présent"', async () => {
    mount([
      entry('OP01-001', { quantity: 1 }),
      entry('OP01-002', { quantity: 3 }),
      entry('OP01-003', { quantity: 2 }),
    ])
    await screen.findByText('Collection de Robin')
    expect(screen.getByRole('tab', { name: /Doubles/ })).toHaveTextContent('2')
  })

  it('filtre par extension depuis la fiche des filtres', async () => {
    mount([
      entry('OP01-001', { packCode: 'OP-01' }),
      entry('OP04-010', { packCode: 'OP-04' }),
    ])
    await screen.findByText('Collection de Robin')
    await openFilters()

    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByText('OP-01'))
    fireEvent.click(within(dialog).getByRole('button', { name: /Voir 1 carte/ }))

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('OP-01')).toBeTruthy() // le résumé "filtres actifs"
  })

  it('trie par valeur décroissante', async () => {
    mount([
      entry('OP01-001', { marketPrice: 5, quantity: 1 }),
      entry('OP01-002', { marketPrice: 40, quantity: 1 }),
    ])
    await screen.findByText('Collection de Robin')
    await openFilters()

    fireEvent.click(screen.getByRole('button', { name: 'Valeur décroissante' }))
    fireEvent.click(screen.getByRole('button', { name: /Voir 2 cartes/ }))

    const names = screen.getAllByAltText(/OP01/).map((img) => img.getAttribute('alt'))
    expect(names[0]).toBe('OP01-002')
  })

  it('la valeur triée est celle du tas, pas le prix unitaire', async () => {
    // 3 exemplaires à 5 (=15) doivent dépasser 1 exemplaire à 12 -- si le tri
    // comparait le prix unitaire au lieu de quantity * price, l'ordre serait inversé.
    mount([
      entry('OP01-001', { marketPrice: 12, quantity: 1 }),
      entry('OP01-002', { marketPrice: 5, quantity: 3 }),
    ])
    await screen.findByText('Collection de Robin')
    await openFilters()

    fireEvent.click(screen.getByRole('button', { name: 'Valeur décroissante' }))
    fireEvent.click(screen.getByRole('button', { name: /Voir 2 cartes/ }))

    const names = screen.getAllByAltText(/OP01/).map((img) => img.getAttribute('alt'))
    expect(names[0]).toBe('OP01-002')
  })

  it('une carte sans cote reste en fin de liste, jamais confondue avec un zéro', async () => {
    mount([
      entry('OP01-001', { marketPrice: null, quantity: 1 }),
      entry('OP01-002', { marketPrice: 1, quantity: 1 }),
    ])
    await screen.findByText('Collection de Robin')
    await openFilters()

    fireEvent.click(screen.getByRole('button', { name: 'Valeur croissante' }))
    fireEvent.click(screen.getByRole('button', { name: /Voir 2 cartes/ }))

    const names = screen.getAllByAltText(/OP01/).map((img) => img.getAttribute('alt'))
    expect(names).toEqual(['OP01-002', 'OP01-001'])
  })

  it('trie les doublons en premier', async () => {
    mount([
      entry('OP01-001', { quantity: 1 }),
      entry('OP01-002', { quantity: 4 }),
    ])
    await screen.findByText('Collection de Robin')
    await openFilters()

    fireEvent.click(screen.getByRole('button', { name: "Doublons d'abord" }))
    fireEvent.click(screen.getByRole('button', { name: /Voir 2 cartes/ }))

    const names = screen.getAllByAltText(/OP01/).map((img) => img.getAttribute('alt'))
    expect(names[0]).toBe('OP01-002')
  })

  it('« Tout effacer » revient à l’édition, l’extension et le tri par défaut', async () => {
    mount([entry('OP01-001', { packCode: 'OP-01', marketPrice: 5 })])
    await screen.findByText('Collection de Robin')
    await openFilters()

    fireEvent.click(screen.getByText('OP-01'))
    fireEvent.click(screen.getByRole('button', { name: 'Valeur décroissante' }))
    fireEvent.click(screen.getByRole('button', { name: /Voir 1 carte/ }))
    expect(screen.getByText(/OP-01/)).toBeTruthy()

    fireEvent.click(screen.getByText('Tout effacer'))
    expect(screen.queryByText('OP-01 · Valeur décroissante')).toBeNull()
  })
})
