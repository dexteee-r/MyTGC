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
  date_added: '2026-01-01', acquisition_price: null, notes: null, card: null,
}

// `id` is never read by the collection-navigation logic (only card_id/language,
// to find this card's own position in the list), so a shared placeholder is fine.
function entry(cardId: string, over: Partial<CollectionEntry> = {}): CollectionEntry {
  return { ...holding, id: 900, card_id: cardId, ...over }
}

const posted: { url: string; method: string; body: unknown }[] = []

function mount(options: {
  card?: Partial<Card>
  collection?: CollectionEntry[]
} = {}) {
  const subject = { ...card, ...options.card }
  const collection = options.collection ?? []
  posted.length = 0

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    if (method !== 'GET') {
      posted.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null })
    }
    // Checked before the bare '/cards/' match below, which '/cards/{id}/prices'
    // also contains. The plain card GET echoes back a name derived from
    // whichever id the URL actually asked for, whenever that id is not
    // `subject`'s own -- so a test can click "next" and see a different card's
    // name arrive, proof that navigation requested a different id rather than
    // only moving a route param nobody read.
    const requestedId = decodeURIComponent(url.split('/cards/')[1]?.split(/[/?]/)[0] ?? '')
    const body = url.includes('/prices')
      ? []
      : url.includes('/cards/')
        ? requestedId === subject.id
          ? subject
          : { ...subject, id: requestedId, name: `Carte ${requestedId}` }
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
                <Route path="/collection" element={<p>Écran Collection</p>} />
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

  it('enregistre une note quand on quitte le champ', async () => {
    mount({ collection: [holding] })
    await screen.findByText('Monkey.D.Luffy')

    await userEvent.click(screen.getByText('Ajouter une note'))
    const field = screen.getByLabelText('Note sur cet exemplaire')
    await userEvent.type(field, 'signée')
    await userEvent.tab()

    await waitFor(() => {
      const write = posted.find((p) => p.method === 'PATCH' && p.url.includes('/collection/7'))
      expect(write).toBeTruthy()
      expect(write?.body).toMatchObject({ notes: 'signée' })
    })
  })

  it('envoie null pour effacer une note plutôt qu’une chaîne vide', async () => {
    mount({ collection: [{ ...holding, notes: 'ancienne note' }] })
    await screen.findByText('Monkey.D.Luffy')

    await userEvent.click(screen.getByText('ancienne note'))
    const field = screen.getByLabelText('Note sur cet exemplaire')
    await userEvent.clear(field)
    await userEvent.tab()

    await waitFor(() => {
      const write = posted.find((p) => p.method === 'PATCH' && p.url.includes('/collection/7'))
      expect(write?.body).toMatchObject({ notes: null })
    })
  })

  it('enregistre la date d’ajout corrigée', async () => {
    mount({ collection: [holding] })
    await screen.findByText('Monkey.D.Luffy')

    await userEvent.click(screen.getByText(/Ajoutée le/))
    const field = screen.getByLabelText("Date d'ajout à la collection")
    await userEvent.clear(field)
    await userEvent.type(field, '2026-02-10')
    await userEvent.tab()

    await waitFor(() => {
      const write = posted.find((p) => p.method === 'PATCH' && p.url.includes('/collection/7'))
      expect(write).toBeTruthy()
      expect(write?.body).toMatchObject({ date_added: '2026-02-10' })
    })
  })

  it('ne borde pas le champ de note en majuscules une fois écrite', async () => {
    /* .t-code met le texte en capitales -- juste pour l'invite "Ajouter une note",
       jamais pour ce que la personne a réellement tapé. Un test plutôt qu'un coup
       d'œil, après avoir fait exactement cette erreur sur la page Légale. */
    mount({ collection: [{ ...holding, notes: 'signée par l’auteur' }] })
    await screen.findByText('Monkey.D.Luffy')
    const button = screen.getByText('signée par l’auteur')
    expect(button.className).not.toContain('t-code')
  })

  it('« Retour » mène toujours à la collection, jamais un simple retour en arrière', async () => {
    /* Not history.back(): once the arrow navigation lets someone hop across
       several cards, "back" would only undo one hop rather than actually leave
       the sheet -- and however this screen was reached, the collection is
       where a held card belongs. */
    mount()
    await screen.findByText('Monkey.D.Luffy')

    await userEvent.click(screen.getByText('Retour'))

    expect(await screen.findByText('Écran Collection')).toBeTruthy()
  })
})

describe('naviguer entre les cartes de la collection', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('ne montre aucun bouton pour une carte absente de la collection', async () => {
    mount({ collection: [entry('OP01-002'), entry('OP01-003')] })
    await screen.findByText('Monkey.D.Luffy')
    expect(screen.queryByLabelText('Carte précédente de la collection')).toBeNull()
    expect(screen.queryByLabelText('Carte suivante de la collection')).toBeNull()
  })

  it('ne montre aucun bouton quand la carte est seule dans la collection', async () => {
    mount({ collection: [holding] })
    await screen.findByText('Monkey.D.Luffy')
    expect(screen.queryByLabelText('Carte précédente de la collection')).toBeNull()
    expect(screen.queryByLabelText('Carte suivante de la collection')).toBeNull()
  })

  it('le bouton suivant mène à la carte suivante de la collection', async () => {
    mount({ collection: [holding, entry('OP01-002')] })
    await screen.findByText('Monkey.D.Luffy')
    expect(screen.queryByLabelText('Carte précédente de la collection')).toBeNull()

    await userEvent.click(screen.getByLabelText('Carte suivante de la collection'))

    expect(await screen.findByText('Carte OP01-002')).toBeTruthy()
  })

  it('le bouton précédent mène à la carte précédente de la collection', async () => {
    mount({ collection: [entry('OP01-000'), holding] })
    await screen.findByText('Monkey.D.Luffy')
    expect(screen.queryByLabelText('Carte suivante de la collection')).toBeNull()

    await userEvent.click(screen.getByLabelText('Carte précédente de la collection'))

    expect(await screen.findByText('Carte OP01-000')).toBeTruthy()
  })

  it('propose les deux boutons quand la carte est au milieu de la liste', async () => {
    mount({ collection: [entry('OP01-000'), holding, entry('OP01-002')] })
    await screen.findByText('Monkey.D.Luffy')
    expect(screen.getByLabelText('Carte précédente de la collection')).toBeTruthy()
    expect(screen.getByLabelText('Carte suivante de la collection')).toBeTruthy()
  })

  it('suit l’ordre de la collection, pas celui d’une extension', async () => {
    /* The whole point of this task: two cards from unrelated sets, adjacent only
       because the collection list puts them next to each other. */
    mount({ collection: [holding, entry('ST01-001')] })
    await screen.findByText('Monkey.D.Luffy')

    await userEvent.click(screen.getByLabelText('Carte suivante de la collection'))

    expect(await screen.findByText('Carte ST01-001')).toBeTruthy()
  })
})

describe('naviguer au clavier', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('la flèche droite mène à la carte suivante de la collection', async () => {
    mount({ collection: [holding, entry('OP01-002')] })
    await screen.findByText('Monkey.D.Luffy')

    await userEvent.keyboard('{ArrowRight}')

    expect(await screen.findByText('Carte OP01-002')).toBeTruthy()
  })

  it('la flèche gauche mène à la carte précédente de la collection', async () => {
    mount({ collection: [entry('OP01-000'), holding] })
    await screen.findByText('Monkey.D.Luffy')

    await userEvent.keyboard('{ArrowLeft}')

    expect(await screen.findByText('Carte OP01-000')).toBeTruthy()
  })

  it('ne fait rien à l’extrémité de la liste où le bouton correspondant est absent', async () => {
    mount({ collection: [holding] })
    await screen.findByText('Monkey.D.Luffy')

    await userEvent.keyboard('{ArrowRight}{ArrowLeft}')

    expect(screen.getByText('Monkey.D.Luffy')).toBeTruthy()
  })

  it('est ignorée quand un champ de texte a le focus', async () => {
    /* The whole reason this guard exists: without it, correcting a note that
       happens to end in an arrow-key edit -- moving the cursor left, say --
       would fire the page's own navigation instead of moving the cursor. */
    mount({ collection: [holding, entry('OP01-002')] })
    await screen.findByText('Monkey.D.Luffy')

    await userEvent.click(screen.getByText('Ajouter une note'))
    const field = screen.getByLabelText('Note sur cet exemplaire')
    field.focus()
    await userEvent.keyboard('{ArrowRight}')

    expect(screen.getByText('Monkey.D.Luffy')).toBeTruthy()
    expect(screen.queryByText('Carte OP01-002')).toBeNull()
  })
})
