import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

function entryWithRarity(id: string, rarity: string | null): CollectionEntry {
  const card: Card = {
    id, language: 'en', name: id, pack_id: '1', pack_code: null, pack_name: null,
    rarity, category: null, colors: [], cost: null, power: null, counter: null,
    attributes: [], types: [], effect: null, trigger: null, release_date: null,
    market_price: null, image_url: null, printings: [],
  }
  return {
    id: id.length, card_id: id, language: 'en', quantity: 1, condition: null,
    date_added: '2026-01-01', acquisition_price: null, notes: null, card,
  }
}

function entryInSet(cardId: string, packCode: string | null): CollectionEntry {
  const card: Card = {
    id: cardId, language: 'en', name: cardId, pack_id: '1', pack_code: packCode, pack_name: null,
    rarity: null, category: null, colors: [], cost: null, power: null, counter: null,
    attributes: [], types: [], effect: null, trigger: null, release_date: null,
    market_price: null, image_url: null, printings: [],
  }
  return {
    id: cardId.length, card_id: cardId, language: 'en', quantity: 1, condition: null,
    date_added: '2026-01-01', acquisition_price: null, notes: null, card,
  }
}

function comboEntry(over: {
  id: string
  packCode?: string | null
  quantity?: number
  marketPrice?: number | null
  dateAdded?: string
}): CollectionEntry {
  const card: Card = {
    id: over.id, language: 'en', name: over.id, pack_id: '1',
    pack_code: over.packCode ?? null, pack_name: null,
    rarity: null, category: null, colors: [], cost: null, power: null, counter: null,
    attributes: [], types: [], effect: null, trigger: null, release_date: null,
    market_price: over.marketPrice ?? null, image_url: null, printings: [],
  }
  return {
    id: over.id.length, card_id: over.id, language: 'en', quantity: over.quantity ?? 1,
    condition: null, date_added: over.dateAdded ?? '2026-01-01', acquisition_price: null,
    notes: null, card,
  }
}

function entryOnDate(cardId: string, dateAdded: string): CollectionEntry {
  const card: Card = {
    id: cardId, language: 'en', name: cardId, pack_id: '1', pack_code: null, pack_name: null,
    rarity: null, category: null, colors: [], cost: null, power: null, counter: null,
    attributes: [], types: [], effect: null, trigger: null, release_date: null,
    market_price: null, image_url: null, printings: [],
  }
  return {
    id: cardId.length, card_id: cardId, language: 'en', quantity: 1, condition: null,
    date_added: dateAdded, acquisition_price: null, notes: null, card,
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
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))
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

/* Sorting by "value" means the pile, not the card: quantity × cote, the same total
   Doubles already uses to tell possédées from échangeables -- decided rather than
   guessed, since a unit price would rank a lone expensive card over a cheaper stack
   worth more overall. */
describe('tri par valeur de la pile', () => {
  beforeEach(() => vi.unstubAllGlobals())

  const cardNames = () =>
    screen.getAllByRole('link', { name: /en collection/ }).map((el) => el.getAttribute('aria-label'))

  it('classe la pile, pas la carte à l’unité', async () => {
    // OP01-001: 1 × 40 € = 40 € ; OP01-002: 3 × 15 € = 45 € -- the stack outranks
    // the pricier single card once quantity is counted in.
    mount(
      [entry('OP01-001', 'en', 1, 40), entry('OP01-002', 'en', 3, 15)],
      stats({ total_quantity: 4, distinct_cards: 2 }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Valeur décroissante' }))
    const names = cardNames()
    expect(names[0]).toContain('OP01-002')
    expect(names[1]).toContain('OP01-001')
  })

  it('laisse les cartes non cotées en dernier, dans les deux sens', async () => {
    mount(
      [entry('OP01-001', 'en', 1, null), entry('OP01-002', 'en', 1, 5)],
      stats({ total_quantity: 2, distinct_cards: 2 }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))
    await screen.findByRole('button', { name: 'Valeur croissante' })

    fireEvent.click(screen.getByRole('button', { name: 'Valeur croissante' }))
    expect(cardNames().at(-1)).toContain('OP01-001')

    fireEvent.click(screen.getByRole('button', { name: 'Valeur décroissante' }))
    expect(cardNames().at(-1)).toContain('OP01-001')
  })
})

/* Rareté sorts on the game's own ladder (Common < Uncommon < Rare < SuperRare <
   SecretRare), not the alphabet -- "SuperRare" and "SecretRare" would tie under a
   naive string compare, and "Common" would outrank both. Leader/Promo/Special/
   TreasureRare sit outside the five-step ladder, placed after SecretRare as the
   rarest tier, TreasureRare last as the game's actual chase rarity. */
describe('tri par rareté', () => {
  beforeEach(() => vi.unstubAllGlobals())

  const cardNames = () =>
    screen.getAllByRole('link', { name: /en collection/ }).map((el) => el.getAttribute('aria-label'))

  it('suit l’échelle du jeu, pas l’ordre alphabétique', async () => {
    // Alphabetically "Common" < "SuperRare", the opposite of the game's own ladder.
    mount(
      [entryWithRarity('OP01-001', 'SuperRare'), entryWithRarity('OP01-002', 'Common')],
      stats({ total_quantity: 2, distinct_cards: 2 }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Plus rare' }))
    const names = cardNames()
    expect(names[0]).toContain('OP01-001')
    expect(names[1]).toContain('OP01-002')
  })

  it('place TreasureRare après SecretRare, comme le palier le plus rare', async () => {
    mount(
      [entryWithRarity('OP01-001', 'TreasureRare'), entryWithRarity('OP01-002', 'SecretRare')],
      stats({ total_quantity: 2, distinct_cards: 2 }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Plus rare' }))
    const names = cardNames()
    expect(names[0]).toContain('OP01-001')
    expect(names[1]).toContain('OP01-002')
  })

  it('laisse les cartes sans rareté connue en dernier, dans les deux sens', async () => {
    mount(
      [entryWithRarity('OP01-001', null), entryWithRarity('OP01-002', 'Rare')],
      stats({ total_quantity: 2, distinct_cards: 2 }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))

    fireEvent.click(await screen.findByRole('button', { name: 'Moins rare' }))
    expect(cardNames().at(-1)).toContain('OP01-001')

    fireEvent.click(screen.getByRole('button', { name: 'Plus rare' }))
    expect(cardNames().at(-1)).toContain('OP01-001')
  })
})

/* "Doublons d'abord" reorders without hiding anything -- unlike the "Doubles" view
   above, which drops every unique card from the list entirely. Highest stack first
   rather than a plain double/unique split, so a 5x lands ahead of a 2x. */
describe('tri par doublon', () => {
  beforeEach(() => vi.unstubAllGlobals())

  const cardNames = () =>
    screen.getAllByRole('link', { name: /en collection/ }).map((el) => el.getAttribute('aria-label'))

  it('met les cartes possédées en plusieurs exemplaires devant les uniques', async () => {
    mount(
      [entry('OP01-001', 'en', 1), entry('OP01-002', 'en', 3)],
      stats({ total_quantity: 4, distinct_cards: 2 }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))
    fireEvent.click(await screen.findByRole('button', { name: "Doublons d'abord" }))
    const names = cardNames()
    expect(names[0]).toContain('OP01-002')
    expect(names[1]).toContain('OP01-001')
  })

  it('classe une pile plus haute avant une pile plus basse, pas seulement double contre unique', async () => {
    mount(
      [entry('OP01-001', 'en', 2), entry('OP01-002', 'en', 5)],
      stats({ total_quantity: 7, distinct_cards: 2 }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))
    fireEvent.click(await screen.findByRole('button', { name: "Doublons d'abord" }))
    const names = cardNames()
    expect(names[0]).toContain('OP01-002')
    expect(names[1]).toContain('OP01-001')
  })

  it('ne masque aucune carte, contrairement à la vue Doubles', async () => {
    mount(
      [entry('OP01-001', 'en', 1), entry('OP01-002', 'en', 2)],
      stats({ total_quantity: 3, distinct_cards: 2 }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))
    fireEvent.click(await screen.findByRole('button', { name: "Doublons d'abord" }))
    expect(cardNames()).toHaveLength(2)
  })
})

/* "Récentes" became two directional chips -- date_desc (newest first, the default)
   and date_asc (oldest first) -- the same shape as every other sort on this page. */
describe("tri par date d'ajout", () => {
  beforeEach(() => vi.unstubAllGlobals())

  const cardNames = () =>
    screen.getAllByRole('link', { name: /en collection/ }).map((el) => el.getAttribute('aria-label'))

  it("« Date d'ajout + » met la plus récente en premier", async () => {
    mount(
      [entryOnDate('OP01-001', '2026-01-01'), entryOnDate('OP01-002', '2026-06-15')],
      stats({ total_quantity: 2, distinct_cards: 2 }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))
    fireEvent.click(await screen.findByRole('button', { name: "Date d'ajout +" }))
    const names = cardNames()
    expect(names[0]).toContain('OP01-002')
    expect(names[1]).toContain('OP01-001')
  })

  it("« Date d'ajout - » met la plus ancienne en premier", async () => {
    mount(
      [entryOnDate('OP01-001', '2026-01-01'), entryOnDate('OP01-002', '2026-06-15')],
      stats({ total_quantity: 2, distinct_cards: 2 }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))
    fireEvent.click(await screen.findByRole('button', { name: "Date d'ajout -" }))
    const names = cardNames()
    expect(names[0]).toContain('OP01-001')
    expect(names[1]).toContain('OP01-002')
  })

  it('regroupe la liste en rangées, une par jour, deux cartes du même jour dans la même rangée', async () => {
    mount(
      [
        entryOnDate('OP01-001', '2026-06-15'),
        entryOnDate('OP01-002', '2026-06-15'),
        entryOnDate('OP01-003', '2026-01-01'),
      ],
      stats({ total_quantity: 3, distinct_cards: 3 }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))
    fireEvent.click(await screen.findByRole('button', { name: "Date d'ajout +" }))

    expect(await screen.findByText('15 juin 2026')).toBeTruthy()
    expect(screen.getByText('1 janvier 2026')).toBeTruthy()

    const rows = [...document.querySelectorAll('section')].filter(
      (section) => section.querySelector('a[aria-label*="en collection"]'),
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].querySelectorAll('a[aria-label*="en collection"]')).toHaveLength(2)
    expect(rows[1].querySelectorAll('a[aria-label*="en collection"]')).toHaveLength(1)
  })
})

/* Extension puis numéro, dans le même sens -- flipping the direction flips both
   levels together, the way turning a real binder over does: the last set and its
   last card lead, not the first set with its numbers reversed. */
describe('tri par extension et numéro', () => {
  beforeEach(() => vi.unstubAllGlobals())

  const cardNames = () =>
    screen.getAllByRole('link', { name: /en collection/ }).map((el) => el.getAttribute('aria-label'))

  it('trie par numéro, pas par ordre alphabétique de l’id', async () => {
    // Unpadded on purpose: "9" < "10" as numbers but "10" < "9" as strings, the
    // exact case a naive string compare gets wrong.
    mount(
      [entryInSet('OP01-10', 'OP-01'), entryInSet('OP01-9', 'OP-01')],
      stats({ total_quantity: 2, distinct_cards: 2 }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Extension croissante' }))
    const names = cardNames()
    expect(names[0]).toContain('OP01-9')
    expect(names[1]).toContain('OP01-10')
  })

  it('inverse l’extension et le numéro ensemble en décroissant', async () => {
    mount(
      [
        entryInSet('OP01-001', 'OP-01'),
        entryInSet('OP01-002', 'OP-01'),
        entryInSet('OP02-001', 'OP-02'),
      ],
      stats({ total_quantity: 3, distinct_cards: 3 }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Extension décroissante' }))
    expect(cardNames()).toEqual([
      expect.stringContaining('OP02-001'),
      expect.stringContaining('OP01-002'),
      expect.stringContaining('OP01-001'),
    ])
  })

  it('laisse les cartes sans extension connue en dernier, dans les deux sens', async () => {
    mount(
      [entryInSet('OP01-001', null), entryInSet('OP02-001', 'OP-02')],
      stats({ total_quantity: 2, distinct_cards: 2 }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))

    fireEvent.click(await screen.findByRole('button', { name: 'Extension croissante' }))
    expect(cardNames().at(-1)).toContain('OP01-001')

    fireEvent.click(screen.getByRole('button', { name: 'Extension décroissante' }))
    expect(cardNames().at(-1)).toContain('OP01-001')
  })
})

/* Each sort dimension is now independent rather than mutually exclusive -- asked
   specifically so several could combine, first-activated as the primary key and
   later ones only breaking its ties, a spreadsheet-style multi-column sort. */
describe('combiner plusieurs tris', () => {
  beforeEach(() => vi.unstubAllGlobals())

  const cardNames = () =>
    screen.getAllByRole('link', { name: /en collection/ }).map((el) => el.getAttribute('aria-label'))

  // Scoped to the sheet: once several criteria are active, the filter TRIGGER
  // button's own aria-label lists them too ("Filtres actifs : ..."), and an
  // unscoped query would match both it and the chip.
  const openFilters = async () => {
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))
    return within(await screen.findByRole('dialog'))
  }

  it('le premier critère activé classe, le second ne départage que ses égalités', async () => {
    // A single, B and C doubled -- "Doublons d'abord" alone ties B and C, and
    // "Date d'ajout -" as the second criterion breaks that tie: oldest first.
    mount(
      [
        comboEntry({ id: 'OP01-001', quantity: 1, dateAdded: '2026-06-01' }),
        comboEntry({ id: 'OP01-002', quantity: 3, dateAdded: '2026-06-01' }),
        comboEntry({ id: 'OP01-003', quantity: 3, dateAdded: '2026-01-01' }),
      ],
      stats({ total_quantity: 7, distinct_cards: 3 }),
    )
    const dialog = await openFilters()
    fireEvent.click(dialog.getByRole('button', { name: /Doublons d'abord/ }))
    fireEvent.click(dialog.getByRole('button', { name: /Date d'ajout -/ }))

    expect(cardNames()).toEqual([
      expect.stringContaining('OP01-003'), // double, older
      expect.stringContaining('OP01-002'), // double, newer
      expect.stringContaining('OP01-001'), // the single, last regardless
    ])
  })

  it("changer le sens d'un critère déjà actif le laisse à sa place dans la combinaison", async () => {
    mount(
      [
        comboEntry({ id: 'OP01-001', packCode: 'OP-01', marketPrice: 5 }),
        comboEntry({ id: 'OP01-002', packCode: 'OP-01', marketPrice: 20 }),
        comboEntry({ id: 'OP02-001', packCode: 'OP-02', marketPrice: 1 }),
      ],
      stats({ total_quantity: 3, distinct_cards: 3 }),
    )
    const dialog = await openFilters()
    fireEvent.click(dialog.getByRole('button', { name: /Extension croissante/ }))
    fireEvent.click(dialog.getByRole('button', { name: /Valeur décroissante/ }))
    // Extension still primary, ascending: OP-01's two cards (by value within)
    // lead, OP-02 trails.
    expect(cardNames()).toEqual([
      expect.stringContaining('OP01-002'),
      expect.stringContaining('OP01-001'),
      expect.stringContaining('OP02-001'),
    ])

    // Flipping the already-active Extension criterion to décroissant keeps it
    // primary -- it reorders which extension leads, but Valeur still only
    // breaks ties inside each one.
    fireEvent.click(dialog.getByRole('button', { name: /Extension décroissante/ }))
    expect(cardNames()).toEqual([
      expect.stringContaining('OP02-001'),
      expect.stringContaining('OP01-002'),
      expect.stringContaining('OP01-001'),
    ])
  })

  it('les rangées groupées disparaissent dès qu’un second critère rejoint la combinaison', async () => {
    mount(
      [
        comboEntry({ id: 'OP01-001', packCode: 'OP-01', marketPrice: 5 }),
        comboEntry({ id: 'OP01-002', packCode: 'OP-01', marketPrice: 20 }),
        comboEntry({ id: 'OP02-001', packCode: 'OP-02', marketPrice: 1 }),
      ],
      stats({ total_quantity: 3, distinct_cards: 3 }),
    )
    const dialog = await openFilters()
    fireEvent.click(dialog.getByRole('button', { name: /Extension croissante/ }))
    expect(await screen.findByText('OP-01')).toBeTruthy()

    fireEvent.click(dialog.getByRole('button', { name: /Valeur décroissante/ }))
    expect(screen.queryByText('OP-01')).toBeNull()
    expect(cardNames()).toEqual([
      expect.stringContaining('OP01-002'),
      expect.stringContaining('OP01-001'),
      expect.stringContaining('OP02-001'),
    ])
  })

  it('désactiver un critère de la combinaison laisse l’autre actif', async () => {
    mount(
      [
        comboEntry({ id: 'OP01-001', quantity: 1, dateAdded: '2026-06-01' }),
        comboEntry({ id: 'OP01-002', quantity: 3, dateAdded: '2026-01-01' }),
      ],
      stats({ total_quantity: 4, distinct_cards: 2 }),
    )
    const dialog = await openFilters()
    fireEvent.click(dialog.getByRole('button', { name: /Doublons d'abord/ }))
    fireEvent.click(dialog.getByRole('button', { name: /Date d'ajout -/ }))
    expect(cardNames()[0]).toContain('OP01-002')

    // Turning Doublons back off leaves Date d'ajout - alone in the chain,
    // rather than resetting everything to the default.
    fireEvent.click(dialog.getByRole('button', { name: /Doublons d'abord/ }))
    expect(cardNames()[0]).toContain('OP01-002') // still the older card, first
  })

  it('le badge de priorité apparaît seulement à partir de deux critères actifs', async () => {
    mount(
      [comboEntry({ id: 'OP01-001', quantity: 3 })],
      stats({ total_quantity: 3, distinct_cards: 1 }),
    )
    const dialog = await openFilters()
    const doublon = dialog.getByRole('button', { name: /Doublons d'abord/ })
    fireEvent.click(doublon)
    expect(doublon.textContent).toBe("Doublons d'abord")

    fireEvent.click(dialog.getByRole('button', { name: /Date d'ajout -/ }))
    expect(doublon.textContent).toBe("Doublons d'abord1")
  })

  it('désactiver le seul critère actif ramène au tri par défaut plutôt qu’à un ordre vide', async () => {
    // Card numbers deliberately disagree with the dates: OP01-001 (the lower
    // number) is the OLDER card. A regression that left the chain empty instead
    // of falling back to the default would still sort by the number tiebreak
    // alone and land on OP01-001 here too, hiding behind a coincidence -- this
    // is why the number and the date cannot agree on the same winner.
    mount(
      [
        comboEntry({ id: 'OP01-002', packCode: 'OP-02', dateAdded: '2026-06-01' }),
        comboEntry({ id: 'OP01-001', packCode: 'OP-01', dateAdded: '2026-01-01' }),
      ],
      stats({ total_quantity: 2, distinct_cards: 2 }),
    )
    const dialog = await openFilters()
    fireEvent.click(dialog.getByRole('button', { name: /Extension croissante/ }))
    expect(cardNames()[0]).toContain('OP01-001') // OP-01 leads, ascending

    // The only active criterion, turned off -- not left with nothing to sort by.
    fireEvent.click(dialog.getByRole('button', { name: /Extension croissante/ }))
    expect(cardNames()[0]).toContain('OP01-002') // back to newest first, the default
  })
})

/* Édition restricts which cards are on the table at all -- before Vue and before
   Trier even get a say. The header meta and "Valeur estimée" stay account-wide on
   purpose (same choice already made for the Doubles view), but Doubles itself has
   to respect the filter: a doubles total that counted both editions while the list
   below showed only one would disagree with itself. */
describe("filtre d'édition sur la page collection", () => {
  beforeEach(() => vi.unstubAllGlobals())

  const cardNames = () =>
    screen.getAllByRole('link', { name: /en collection/ }).map((el) => el.getAttribute('aria-label'))

  it('restreint la liste à l’édition choisie', async () => {
    mount(
      [entry('OP01-001', 'en', 1), entry('OP01-001', 'jp', 1)],
      stats({ total_quantity: 2, distinct_cards: 2 }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))
    fireEvent.click(await screen.findByRole('tab', { name: /^JP/ }))
    expect(cardNames()).toHaveLength(1)
  })

  it('scope aussi la vue Doubles, liste et total ensemble', async () => {
    mount(
      [entry('OP01-001', 'en', 3, 10), entry('OP01-002', 'jp', 3, 10)],
      stats({ total_quantity: 6, distinct_cards: 2 }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))
    fireEvent.click(await screen.findByRole('tab', { name: /^JP/ }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Doubles' }))

    // Only the JP double is listed, and its own value -- not the EN one too --
    // is what "possédées" totals.
    expect(cardNames()).toHaveLength(1)
    expect(await screen.findByText('30 €')).toBeTruthy()
  })

  it('revient à « Les deux » avec Tout effacer', async () => {
    mount(
      [entry('OP01-001', 'en', 1), entry('OP01-002', 'jp', 1)],
      stats({ total_quantity: 2, distinct_cards: 2 }),
    )
    fireEvent.click(await screen.findByRole('button', { name: /Filtres/ }))
    fireEvent.click(await screen.findByRole('tab', { name: /^JP/ }))
    expect(cardNames()).toHaveLength(1)

    fireEvent.click(screen.getAllByRole('button', { name: 'Tout effacer' })[0])
    expect(cardNames()).toHaveLength(2)
  })
})

/* Vue and Trier used to sit directly on the page as their own segmented rows; both
   now live behind one filter button, the same shape Chercher and Recherchées already
   use -- a control you cannot see from the closed button is one you forget you set,
   so the button itself has to say when something other than the default is chosen. */
describe('le bouton filtres sur la page collection', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('ne signale rien tant que Vue et Trier sont sur leur valeur par défaut', async () => {
    mount([entry('OP01-001', 'en', 1, 10)], stats({ total_quantity: 1, distinct_cards: 1 }))
    expect(await screen.findByRole('button', { name: 'Filtres' })).toBeTruthy()
  })

  it('signale Doubles une fois choisi, et l’efface avec Tout effacer', async () => {
    mount([entry('OP01-001', 'en', 2, 10)], stats({ total_quantity: 2, distinct_cards: 1 }))
    fireEvent.click(await screen.findByRole('button', { name: 'Filtres' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Doubles' }))

    expect(await screen.findByRole('button', { name: 'Filtres actifs : Doubles' })).toBeTruthy()

    // Two "Tout effacer" buttons exist while the sheet is open: the applied-filters
    // row behind it, and the sheet's own footer. Either clears the same state.
    fireEvent.click(screen.getAllByRole('button', { name: 'Tout effacer' })[0])
    expect(await screen.findByRole('button', { name: 'Filtres' })).toBeTruthy()
  })
})
