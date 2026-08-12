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

export type Sort = 'code' | 'set' | 'name'

export interface FilterState {
  /* null is both editions. The catalogue holds each card twice and searching a name
     across the two is the normal case when you cannot remember which one you own. */
  language: Language | null
  rarities: string[]
  colors: string[]
  owned: boolean | null
  sort: Sort
  columns: number
}

export const EMPTY: Omit<FilterState, 'sort' | 'columns' | 'language'> = {
  rarities: [],
  colors: [],
  owned: null,
}

/* What is on, in words, for the trigger that opens this panel — a filter you cannot
   see is a filter you forget you set, and then a small result count reads as a bug.
   Sort and columns are deliberately absent: they change the order and the size of
   the answer, never which cards are in it. */
export function appliedLabels(state: FilterState): string[] {
  return [
    state.language === 'en' ? 'INT' : state.language === 'jp' ? 'JP' : null,
    state.owned === true ? 'Possédées' : state.owned === false ? 'Manquantes' : null,
    ...state.colors,
    ...state.rarities,
  ].filter(Boolean) as string[]
}

export function isFiltered(state: FilterState): boolean {
  return appliedLabels(state).length > 0
}

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

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
      {/* 2. Ajout d'une div globale text-white pour tout le contenu intérieur */}
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

      <Group label="Trier">
        <Segmented
          value={state.sort}
          options={[
            { value: 'code' as const, label: 'Par code' },
            { value: 'set' as const, label: 'Par extension' },
            { value: 'name' as const, label: 'A → Z' },
          ]}
          onChange={(next) => set('sort', next)}
          label="Trier"
        />
      </Group>

      {/* Not a viewport question — two is readable and three fits more, and which
          one is right is a taste. So it is a preference, and it is set here rather
          than in a settings screen nobody would go to for it. */}
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
