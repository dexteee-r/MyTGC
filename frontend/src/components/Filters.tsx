import { CARD_COLORS, Button, Chip, Segmented, Sheet } from './ui'
import { Edition } from './Edition'
import type { Language } from '../lib/types'

/* ── One filter panel, two screens ──────────────────────────────────────────
   Search and the want list ask the same questions of the same catalogue, so they
   ask them with the same component. Duplicating it is how the two drift: a rarity
   added here and forgotten there reads as a bug in whichever screen was missed.   */

export const RARITIES = [
  'Leader',
  'Common',
  'Uncommon',
  'Rare',
  'SuperRare',
  'SecretRare',
  'Special',
  'TreasureRare',
  'Promo',
]

export type Sort = 'code' | 'set' | 'name' | 'date' | 'price_asc' | 'price_desc'

/* Shared with Wishlist.tsx, which also uses it on the poster's own stamp and star
   row -- one dictionary rather than two, so a wording change cannot land in the
   filter and not the poster (or the reverse). */
export const PRIORITY_LABELS: Record<number, string> = {
  1: 'Dès que possible',
  2: 'Si ça se présente',
  3: 'Un jour',
}

export interface FilterState {
  /* null is both editions. The catalogue holds each card twice and searching a name
     across the two is the normal case when you cannot remember which one you own. */
  language: Language | null
  rarities: string[]
  colors: string[]
  owned: boolean | null
  /* Meaningless to Search -- a card has no priority, only a wishlist entry does --
     so it always stays empty there. Kept on the one shared shape anyway rather than
     a second FilterState, same reasoning as the rest of this file. */
  priorities: number[]
  sort: Sort
  columns: number
}

export const EMPTY: Omit<FilterState, 'sort' | 'columns' | 'language'> = {
  rarities: [],
  colors: [],
  owned: null,
  priorities: [],
}

/* What is on, in words, for the trigger that opens this panel — a filter you cannot
   see is a filter you forget you set, and then a small result count reads as a bug.
   Sort and columns are deliberately absent: they change the order and the size of
   the answer, never which cards are in it. */
export function appliedLabels(state: FilterState, baseline?: Language | null): string[] {
  /* The edition the account opens on is the baseline, not a filter: listing it would
     leave a chip that "Tout effacer" can never remove, since clearing returns to it.
     Any other edition -- including both at once -- is a choice, and says so. */
  const edition = state.language === baseline
    ? null
    : state.language === 'en' ? 'INT' : state.language === 'jp' ? 'JP' : 'Les deux'

  return [
    edition,
    state.owned === true ? 'Possédées' : state.owned === false ? 'Manquantes' : null,
    ...state.colors,
    ...state.rarities,
    ...state.priorities.map((level) => PRIORITY_LABELS[level]),
  ].filter(Boolean) as string[]
}

export function isFiltered(state: FilterState, baseline?: Language | null): boolean {
  return appliedLabels(state, baseline).length > 0
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

export function FilterSheet({
  open,
  onClose,
  state,
  onChange,
  onClear,
  total,
  loading,
  columns = true,
  owned = true,
  priority = false,
}: {
  open: boolean
  onClose: () => void
  state: FilterState
  onChange: (next: FilterState) => void
  onClear: () => void
  total: number
  loading?: boolean
  /* The want list is one poster per row, so the column choice has nothing to act on
     there and showing it would offer a setting that does nothing. Same for owned:
     everything on that list is by definition not owned, and a control that cannot
     change the answer is a control that lies. */
  columns?: boolean
  owned?: boolean
  /* The reverse of the two above: a card in the catalogue has no priority, only a
     wishlist entry does, so this defaults off and only Recherchées turns it on. */
  priority?: boolean
}) {
  const set = <K extends keyof FilterState>(key: K, value: FilterState[K]) =>
    onChange({ ...state, [key]: value })

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtres"
      footer={
        <div className="flex gap-2">
          <div className="shrink-0">
            <Button variant="quiet" onClick={onClear} disabled={!isFiltered(state)}>
              Tout effacer
            </Button>
          </div>
          <Button full onClick={onClose}>
            {loading ? 'Recherche…' : `Voir ${total.toLocaleString('fr')} carte${total > 1 ? 's' : ''}`}
          </Button>
        </div>
      }
    >
      <div className="text-white">
        <Group label="Édition">
          <Segmented
            value={state.language ?? 'all'}
            options={[
              { value: 'all' as const, label: 'Les deux' },
              { value: 'en' as const, label: <Edition language="en" /> },
              { value: 'jp' as const, label: <Edition language="jp" /> },
            ]}
            onChange={(next) => set('language', next === 'all' ? null : (next as Language))}
            label="Édition"
          />
        </Group>

        {owned && (
        <Group label="Collection">
          <Chip
            active={state.owned === true}
            onClick={() => set('owned', state.owned === true ? null : true)}
          >
            Possédées
          </Chip>
          <Chip
            active={state.owned === false}
            onClick={() => set('owned', state.owned === false ? null : false)}
          >
            Manquantes
          </Chip>
        </Group>
        )}

        <Group label="Couleur">
          {CARD_COLORS.map((name) => (
            <Chip
              key={name}
              swatch={name}
              active={state.colors.includes(name)}
              onClick={() => set('colors', toggle(state.colors, name))}
            >
              {name}
            </Chip>
          ))}
        </Group>

        <Group label="Rareté">
          {RARITIES.map((name) => (
            <Chip
              key={name}
              active={state.rarities.includes(name)}
              onClick={() => set('rarities', toggle(state.rarities, name))}
            >
              {name}
            </Chip>
          ))}
        </Group>

        {priority && (
        <Group label="Priorité">
          {[1, 2, 3].map((level) => {
            const stars = 4 - level
            return (
              <Chip
                key={level}
                active={state.priorities.includes(level)}
                onClick={() => set('priorities', toggle(state.priorities, level))}
              >
                {'★'.repeat(stars)}
                {'☆'.repeat(3 - stars)} {PRIORITY_LABELS[level]}
              </Chip>
            )
          })}
        </Group>
        )}

        <Group label="Trier">
          <Segmented<Sort>
            value={state.sort}
            options={[
              { value: 'code', label: 'Par code' },
              { value: 'set', label: 'Par extension' },
              { value: 'date', label: 'Plus récentes' },
              { value: 'name', label: 'A → Z' },
            ]}
            onChange={(next) => set('sort', next)}
            label="Trier"
          />
          {/* A second row rather than two more segments squeezed into the one above:
              six options in a row this narrow would each shrink to a sliver. Neither
              chip reflecting the segment above as active is correct, not a bug — a
              price sort is a different choice from those four, not a fifth one among
              them. */}
          <div className="flex gap-2 pt-2">
            <Chip active={state.sort === 'price_desc'} onClick={() => set('sort', 'price_desc')}>
              Prix décroissant
            </Chip>
            <Chip active={state.sort === 'price_asc'} onClick={() => set('sort', 'price_asc')}>
              Prix croissant
            </Chip>
          </div>
        </Group>

        {columns && (
        <Group label="Affichage">
          <Segmented
            value={String(state.columns)}
            options={[
              { value: '2', label: '2 par ligne' },
              { value: '3', label: '3 par ligne' },
            ]}
            onChange={(next) => set('columns', Number(next))}
            label="Cartes par ligne"
          />
        </Group>
        )}
      </div>
    </Sheet>
  )
}

/* Wrapped rather than scrolled sideways: in a sheet there is room to show every
   option at once, and a horizontal scroller hides the ones at the end. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="pt-5 first:pt-2">
      <h3 className="t-eyebrow pb-2.5">{label}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  )
}
