import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../lib/auth'
import { CollectionProvider } from '../lib/collection'
import { LanguageProvider } from '../lib/language'
import { ToastProvider } from '../lib/toast'
import type { Card, ScanResult } from '../lib/types'
import { Search, resetSearchMemory } from './Search'

// MemoryRouter's history is separate from window.location -- reading the URL a
// search produces means asking the router itself, from inside its own tree.
function LocationProbe() {
  return <p data-testid="location-search">{useLocation().search}</p>
}

/* Chercher par image: le pipeline de scan existant, entré depuis une image choisie
   ou collée plutôt que depuis une capture caméra. Contrairement à Scanner, taper sur
   un candidat ouvre sa fiche plutôt que de l'ajouter à la collection -- ces tests
   couvrent ce chemin-ci, pas la recherche texte qui a déjà ses propres réglages. */

const CARD: Card = {
  id: 'OP01-001', language: 'en', name: 'Monkey.D.Luffy', pack_id: '569101',
  pack_code: 'OP-01', pack_name: 'ROMANCE DAWN', rarity: 'Leader', category: 'Leader',
  colors: ['Red'], cost: 5, power: 5000, counter: null, attributes: [], types: [],
  effect: null, trigger: null, release_date: '2022-12-02', market_price: 4.75,
  image_url: null, printings: [],
}

const CONFIDENT_RESULT: ScanResult = {
  detected: true, confident: true, margin: 12, message: null,
  candidates: [{
    card_number: 'OP01-001', language: 'en', name: 'Monkey.D.Luffy', distance: 2,
    ambiguous_printing: false,
    printings: [{ card_id: 'OP01-001', distance: 2, pack_code: 'OP-01', rarity: 'Leader' }],
    card: CARD,
  }],
}

function mount(
  scanResponse: () => Response | Promise<Response>,
  initialPath = '/search',
) {
  resetSearchMemory()
  const scanCalls: string[] = []

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/scan')) {
      scanCalls.push(url)
      return scanResponse()
    }
    if (url.includes('/cards?')) {
      return { ok: true, status: 200, json: async () => ({ items: [], total: 0 }),
               text: async () => '' } as Response
    }
    if (url.includes('/search-history')) {
      return { ok: true, status: 200, json: async () => [], text: async () => '' } as Response
    }
    // Suggestions (typing a non-empty query) reads the collection to mark owned
    // cards -- empty here, since none of these tests are about ownership.
    if (url.includes('/collection/stats')) {
      return {
        ok: true, status: 200, text: async () => '',
        json: async () => ({
          distinct_cards: 0, total_quantity: 0, by_language: {}, by_rarity: {},
          acquisition_total: 0,
        }),
      } as Response
    }
    if (url.includes('/collection')) {
      return { ok: true, status: 200, json: async () => [], text: async () => '' } as Response
    }
    // Auth boot (refresh) and anything else this screen does not otherwise care about.
    void init
    return { ok: false, status: 401, json: async () => ({}), text: async () => '' } as Response
  }))

  const rendered = render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <LanguageProvider>
          <CollectionProvider>
            <ToastProvider>
              <Routes>
                <Route path="/search" element={<Search />} />
                <Route path="/card/:cardId" element={<p>Fiche de la carte</p>} />
              </Routes>
              <LocationProbe />
            </ToastProvider>
          </CollectionProvider>
        </LanguageProvider>
      </AuthProvider>
    </MemoryRouter>,
  )
  return { ...rendered, scanCalls }
}

function pasteImage() {
  const input = screen.getByLabelText('Rechercher une carte')
  const file = new File(['x'], 'card.jpg', { type: 'image/jpeg' })
  const clipboardData = {
    items: [{ type: 'image/jpeg', getAsFile: () => file }],
  } as unknown as DataTransfer
  fireEvent.paste(input, { clipboardData })
}

describe('recherche par image sur Chercher', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('affiche le panneau de candidats sur une correspondance confiante', async () => {
    mount(async () => ({
      ok: true, status: 200, json: async () => CONFIDENT_RESULT, text: async () => '',
    }) as Response)

    pasteImage()

    await screen.findByText('Monkey.D.Luffy')
    expect(screen.getByText('Recherche par image')).toBeInTheDocument()
  })

  it("envoie l'image sur /scan avec source=import, jamais source=camera", async () => {
    const { scanCalls } = mount(async () => ({
      ok: true, status: 200, json: async () => CONFIDENT_RESULT, text: async () => '',
    }) as Response)

    pasteImage()
    await screen.findByText('Monkey.D.Luffy')

    expect(scanCalls).toHaveLength(1)
    expect(scanCalls[0]).toContain('source=import')
    expect(scanCalls[0]).not.toContain('source=camera')
  })

  it('ouvre la fiche de la carte quand on tape un candidat, plutôt que de l\'ajouter', async () => {
    mount(async () => ({
      ok: true, status: 200, json: async () => CONFIDENT_RESULT, text: async () => '',
    }) as Response)

    pasteImage()
    fireEvent.click(await screen.findByText('Monkey.D.Luffy'))

    await screen.findByText('Fiche de la carte')
  })

  it("dit qu'aucune carte n'a été reconnue plutôt que de laisser un panneau vide", async () => {
    mount(async () => ({
      ok: true, status: 200,
      json: async () => ({
        detected: false, confident: false, margin: null, message: null,
        reason: 'none', candidates: [],
      }) as ScanResult,
      text: async () => '',
    }) as Response)

    pasteImage()

    await screen.findByText('Aucune carte reconnaissable dans cette image.')
  })

  it('se ferme sur "Fermer" sans relancer la recherche', async () => {
    mount(async () => ({
      ok: true, status: 200, json: async () => CONFIDENT_RESULT, text: async () => '',
    }) as Response)

    pasteImage()
    await screen.findByText('Monkey.D.Luffy')

    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    await waitFor(() => expect(screen.queryByText('Recherche par image')).toBeNull())
  })

  it('ignore un collage qui ne contient pas une image', () => {
    const { scanCalls } = mount(async () => ({
      ok: true, status: 200, json: async () => CONFIDENT_RESULT, text: async () => '',
    }) as Response)

    const input = screen.getByLabelText('Rechercher une carte')
    const clipboardData = { items: [{ type: 'text/plain', getAsFile: () => null }] } as unknown as DataTransfer
    fireEvent.paste(input, { clipboardData })

    expect(scanCalls).toHaveLength(0)
    expect(screen.queryByText('Recherche par image')).toBeNull()
  })
})

describe('la recherche est dans l’URL', () => {
  beforeEach(() => vi.unstubAllGlobals())

  const noScan = async () =>
    ({ ok: false, status: 404, json: async () => ({}), text: async () => '' }) as Response

  it('une URL partagée restaure le texte et les filtres', async () => {
    mount(noScan, '/search?q=Luffy&rarity=Leader&lang=jp')

    expect(await screen.findByLabelText('Rechercher une carte')).toHaveValue('Luffy')
    expect(
      screen.getByRole('button', { name: /Filtres actifs :.*Leader/ }),
    ).toBeInTheDocument()
  })

  it('taper une recherche le reflète dans l’URL', async () => {
    mount(noScan)
    fireEvent.change(screen.getByLabelText('Rechercher une carte'), {
      target: { value: 'Zoro' },
    })

    await waitFor(() => expect(screen.getByTestId('location-search').textContent).toContain('q=Zoro'), {
      timeout: 1000,
    })
  })
})
