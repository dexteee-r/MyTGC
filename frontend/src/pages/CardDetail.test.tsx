import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../lib/auth'
import { CollectionProvider } from '../lib/collection'
import { LanguageProvider } from '../lib/language'
import { ToastProvider } from '../lib/toast'
import type { Card, CollectionEntry } from '../lib/types'
import { CardDetail } from './CardDetail'

/* The quantity control is the whole screen: it is the gesture a collector repeats more
   than any other, and it now has to work identically at nought and at nine. Filing the
   first copy used to be a dropdown plus a submit button — a different, heavier path
   that this guards against coming back. */

const card: Card = {
  id: 'OP01-001', language: 'en', name: 'Monkey.D.Luffy', pack_id: '569101',
  pack_code: 'OP-01', pack_name: 'ROMANCE DAWN', rarity: 'Leader', category: 'Leader',
  colors: ['Red'], cost: 5, power: 5000, counter: null, attributes: [], types: [],
  effect: null, trigger: null, release_date: '2022-12-02', market_price: 4.75,
  image_url: '/images/en/OP01-001.png', printings: [],
}

const holding: CollectionEntry = {
  id: 7, card_id: 'OP01-001', language: 'en', quantity: 2, condition: 'near_mint',
  date_added: '2026-01-01', acquisition_price: null, card: null,
}

const posted: { url: string; method: string; body: unknown }[] = []

function mount(options: { card?: Partial<Card>; collection?: CollectionEntry[] } = {}) {
  const subject = { ...card, ...options.card }
  const collection = options.collection ?? []
  posted.length = 0

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      posted.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null })
    }
    const body = url.includes('/cards/')
      ? subject
      : url.includes('/wishlist')
        ? []
        : url.includes('/collection/stats')
          ? {
              distinct_cards: 0, total_quantity: 0, by_language: {}, by_rarity: {},
              acquisition_total: 0, market_total: 0, market_priced: 0,
              market_currency: 'EUR',
            }
          : collection
    return { ok: true, status: 200, json: async () => body, text: async () => '' } as Response
  }))

  return render(
    <MemoryRouter initialEntries={['/card/OP01-001?language=en']}>
      <AuthProvider>
        <LanguageProvider>
          <CollectionProvider>
            <ToastProvider>
              <Routes>
                <Route path="/card/:cardId" element={<CardDetail />} />
              </Routes>
            </ToastProvider>
          </CollectionProvider>
        </LanguageProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
}

const add = () => screen.getByLabelText('Ajouter un exemplaire')
const remove = () => screen.getByLabelText('Retirer un exemplaire')

describe('la fiche carte', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('montre le compteur à zéro pour une carte qu’on ne possède pas', async () => {
    mount()
    expect(await screen.findByText('Monkey.D.Luffy')).toBeTruthy()
    expect(screen.getByText('0')).toBeTruthy()
    expect(screen.getByText('exemplaire')).toBeTruthy()
  })

  it('range la carte au premier « + » sans passer par un formulaire', async () => {
    mount()
    await screen.findByText('Monkey.D.Luffy')
    await userEvent.click(add())

    await waitFor(() => {
      const write = posted.find((p) => p.method === 'POST' && p.url.includes('/collection'))
      expect(write).toBeTruthy()
      expect(write?.body).toMatchObject({ card_id: 'OP01-001', language: 'en', quantity: 1 })
    })
  })

  it('ne propose pas d’état tant que la carte n’est pas possédée', async () => {
    mount()
    await screen.findByText('Monkey.D.Luffy')
    expect(screen.queryByText('État')).toBeNull()
  })

  it('propose l’état une fois la carte possédée', async () => {
    mount({ collection: [holding] })
    await screen.findByText('Monkey.D.Luffy')
    await waitFor(() => expect(screen.getByText('État')).toBeTruthy())
  })

  it('interdit de descendre sous zéro', async () => {
    mount()
    await screen.findByText('Monkey.D.Luffy')
    expect((remove() as HTMLButtonElement).disabled).toBe(true)
  })

  it('affiche la cote de la carte', async () => {
    mount()
    expect(await screen.findByText('4,75 €')).toBeTruthy()
  })

  it('dit pourquoi quand il n’y a pas de cote, plutôt que de laisser un blanc', async () => {
    mount({ card: { market_price: null } })
    await screen.findByText('Monkey.D.Luffy')
    expect(screen.getByText('Tirage non coté')).toBeTruthy()
  })
})
