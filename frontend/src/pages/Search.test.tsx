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
  image_url: null, artist: null, printings: [],
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
  cardItems: Card[] = [],
) {
  resetSearchMemory()
  const scanCalls: string[] = []
  const cardCalls: string[] = []

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/scan')) {
      scanCalls.push(url)
      return scanResponse()
    }
    if (url.includes('/cards?')) {
      cardCalls.push(url)
      return { ok: true, status: 200, json: async () => ({ items: cardItems, total: cardItems.length }),
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
  return { ...rendered, scanCalls, cardCalls }
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

  it('une URL partagée restaure aussi le filtre par illustrateur', async () => {
    mount(noScan, '/search?q=Luffy&artist=Nakamaru')

    expect(
      await screen.findByRole('button', { name: /Filtres actifs :.*Nakamaru/ }),
    ).toBeInTheDocument()
  })

  it('le filtre par illustrateur atteint bien la requête au catalogue', async () => {
    const { cardCalls } = mount(noScan, '/search?q=Luffy&artist=Nakamaru')
    await waitFor(() => expect(cardCalls.length).toBeGreaterThan(0))
    expect(cardCalls.some((url) => url.includes('artist=Nakamaru'))).toBe(true)
  })

  // DON!! cards carry rarity: 'DON!!' in the catalogue -- the literal value, "!!"
  // included, has to survive a round trip through the URL (URLSearchParams percent-
  // encodes it to %21%21) and back into the chip's own active state. Restoring the
  // *label* alone would pass even if the "DON!!" chip had never been added to the
  // Rareté group at all (appliedLabels only echoes state.rarities back, regardless
  // of what RARITIES contains) -- so this opens the sheet and checks the chip
  // itself, the thing the RARITIES literal actually controls.
  it('une carte DON!! peut être choisie dans le groupe Rareté du panneau de filtres', async () => {
    mount(noScan)
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))
    expect(await screen.findByRole('button', { name: 'DON!!' })).toBeInTheDocument()
  })

  it('une URL partagée restaure aussi le filtre de rareté DON!!, chip actif inclus', async () => {
    mount(noScan, '/search?q=Luffy&rarity=DON!!')

    expect(
      await screen.findByRole('button', { name: /Filtres actifs :.*DON!!/ }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Filtres/ }))
    const chip = await screen.findByRole('button', { name: 'DON!!' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
  })

  it('le filtre de rareté DON!! atteint bien la requête au catalogue', async () => {
    const { cardCalls } = mount(noScan, '/search?q=Luffy&rarity=DON!!')
    await waitFor(() => expect(cardCalls.length).toBeGreaterThan(0))
    expect(cardCalls.some((url) => url.includes('rarity=DON%21%21'))).toBe(true)
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

/* Chercher opts into the same visible desktop rail Collection and Recherchées
   already show on their own long lists -- off by default on CardGrid (PackDetail,
   its other caller, keeps the app's usual chromeless scroll), on here specifically. */
describe('barre de défilement sur Chercher', () => {
  beforeEach(() => vi.unstubAllGlobals())

  const noScan = async () =>
    ({ ok: false, status: 404, json: async () => ({}), text: async () => '' }) as Response

  it('le mur de résultats affiche le rail visible sur desktop', async () => {
    // jsdom lays nothing out (clientWidth stays 0), so the virtualizer never
    // actually paints a row -- the container CardGrid renders once cards.length > 0
    // is what is under test here, not a specific card tile.
    const { cardCalls } = mount(noScan, '/search', [CARD])
    await waitFor(() => expect(cardCalls.length).toBeGreaterThan(0))

    const wall = await waitFor(() => {
      const el = document.querySelector('.no-scrollbar')
      expect(el).toBeTruthy()
      return el!
    })
    expect(wall).toHaveClass('scrollbar-desktop')
  })
})
