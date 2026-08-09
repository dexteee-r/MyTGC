import { useEffect, useState } from 'react'
import { CardGrid } from '../components/CardGrid'
import { SearchIcon } from '../components/icons'
import {
  Button,
  CARD_COLORS,
  Chip,
  EmptyState,
  ErrorState,
  Rule,
  PageHeader,
  Segmented,
  Sheet,
  Spinner,
} from '../components/ui'
import { api } from '../lib/api'
import { LANGUAGE_OPTIONS, useLanguage } from '../lib/language'
import type { Card } from '../lib/types'

const PAGE = 60
const RARITIES = ['Leader', 'Common', 'Uncommon', 'Rare', 'SuperRare', 'SecretRare', 'Promo']

export function Search() {
  const { language, setLanguage } = useLanguage()
  const [query, setQuery] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [rarity, setRarity] = useState<string | null>(null)
  const [owned, setOwned] = useState<boolean | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const filters = {
    q: query || undefined,
    language,
    color: color ?? undefined,
    rarity: rarity ?? undefined,
    owned: owned ?? undefined,
  }

  useEffect(() => {
    // Debounced: a keystroke should not fire a query against 9,447 rows.
    const timer = setTimeout(() => {
      setLoading(true)
      setFailed(false)
      api
        .cards({ ...filters, limit: PAGE })
        .then((page) => {
          setCards(page.items)
          setTotal(page.total)
        })
        .catch(() => setFailed(true))
        .finally(() => setLoading(false))
    }, 220)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, language, color, rarity, owned])

  const loadMore = () => {
    if (cards.length >= total || loading) return
    api
      .cards({ ...filters, limit: PAGE, offset: cards.length })
      .then((page) =>
        setCards((current) => (current.length >= total ? current : [...current, ...page.items])),
      )
      .catch(() => {})
  }

  const clearFilters = () => {
    setColor(null)
    setRarity(null)
    setOwned(null)
  }

  /* Named so the trigger can say what is on without being opened. Losing that was the
     risk in moving the chips off the screen: a filter you cannot see is a filter you
     forget you set, and then the result count looks like a bug. */
  const applied = [
    owned === true ? 'Possédées' : owned === false ? 'Manquantes' : null,
    color,
    rarity,
  ].filter(Boolean) as string[]

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Recherche"
        meta={loading ? 'Recherche…' : `${total.toLocaleString('fr')} carte${total > 1 ? 's' : ''}`}
        action={
          <div className="w-36">
            <Segmented
              value={language}
              options={LANGUAGE_OPTIONS}
              onChange={setLanguage}
              label="Édition"
            />
          </div>
        }
      />

      {/* The search field and the way into the filters, and nothing else. Two rows of
          chips used to sit here permanently — they cost a third of the screen on a
          phone, every time, to hold controls that are touched occasionally. */}
      <div className="relative px-4 py-3">
        <div className="sunken flex min-h-11 items-center gap-2.5 px-3">
          <SearchIcon className="size-4 shrink-0 text-[var(--text-faint)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nom ou code (OP09-093)"
            aria-label="Rechercher une carte"
            className="min-w-0 flex-1 bg-transparent py-2.5 outline-none placeholder:text-[var(--text-faint)]"
          />
          {query && (
            <button onClick={() => setQuery('')} className="t-code shrink-0 px-1">
              Effacer
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 pt-2.5">
          <button
            onClick={() => setFiltersOpen(true)}
            aria-haspopup="dialog"
            style={{ boxShadow: applied.length ? 'var(--relief)' : 'var(--groove)' }}
            className={`flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-[2px] px-3 text-sm ${
              applied.length ? 'bg-[var(--surface-rail)] text-[var(--text-primary)]' : 'bg-[var(--surface-recessed)] text-[var(--text-secondary)]'
            }`}
          >
            <FilterIcon className="size-4 shrink-0" />
            <span className="shrink-0 font-semibold">Filtres</span>
            {applied.length > 0 && (
              <span className="t-code min-w-0 flex-1 truncate text-left text-sun-500">
                {applied.join(' · ')}
              </span>
            )}
          </button>
          {applied.length > 0 && (
            <button onClick={clearFilters} className="t-code min-h-10 shrink-0 px-2">
              Tout effacer
            </button>
          )}
        </div>
        <Rule />
      </div>

      {failed ? (
        <div className="pt-8">
          <ErrorState onRetry={() => setQuery((q) => q)} />
        </div>
      ) : loading && cards.length === 0 ? (
        <Spinner />
      ) : cards.length === 0 ? (
        <div className="pt-8">
          <EmptyState title="Aucun résultat">
            Aucune carte ne correspond. Retire un filtre ou vérifie le code.
          </EmptyState>
        </div>
      ) : (
        <CardGrid
          cards={cards}
          onEndReached={loadMore}
          loadingMore={cards.length < total}
          showArt
        />
      )}

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtres"
        footer={
          <div className="flex gap-2">
            <div className="shrink-0">
              <Button variant="quiet" onClick={clearFilters} disabled={applied.length === 0}>
                Tout effacer
              </Button>
            </div>
            <Button full onClick={() => setFiltersOpen(false)}>
              {loading
                ? 'Recherche…'
                : `Voir ${total.toLocaleString('fr')} carte${total > 1 ? 's' : ''}`}
            </Button>
          </div>
        }
      >
        {/* Filters apply as they are tapped rather than on a Confirm: the count in the
            footer moves with each one, which is the answer you came for. */}
        <FilterGroup label="Collection">
          <Chip active={owned === true} onClick={() => setOwned(owned === true ? null : true)}>
            Possédées
          </Chip>
          <Chip active={owned === false} onClick={() => setOwned(owned === false ? null : false)}>
            Manquantes
          </Chip>
        </FilterGroup>

        <FilterGroup label="Couleur">
          {CARD_COLORS.map((name) => (
            <Chip
              key={name}
              swatch={name}
              active={color === name}
              onClick={() => setColor(color === name ? null : name)}
            >
              {name}
            </Chip>
          ))}
        </FilterGroup>

        <FilterGroup label="Rareté">
          {RARITIES.map((name) => (
            <Chip
              key={name}
              active={rarity === name}
              onClick={() => setRarity(rarity === name ? null : name)}
            >
              {name}
            </Chip>
          ))}
        </FilterGroup>
      </Sheet>
    </div>
  )
}

/* Wrapped rather than scrolled sideways: in a sheet there is room to show every option
   at once, and a horizontal scroller hides the ones at the end. */
function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="pt-4">
      <h3 className="t-display pb-2.5 text-[0.65rem] text-[var(--text-secondary)]">{label}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  )
}

function FilterIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path
        d="M3 5h14M6 10h8M8.5 15h3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
