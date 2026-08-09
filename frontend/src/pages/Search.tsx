import { useEffect, useState } from 'react'
import { CardGrid } from '../components/CardGrid'
import {
  EMPTY,
  FilterSheet,
  appliedLabels,
  isFiltered,
  type FilterState,
} from '../components/Filters'
import { SearchIcon } from '../components/icons'
import { Suggestions } from '../components/Suggestions'
import { Adrift, EmptyState, PageHeader, Sounding } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLanguage } from '../lib/language'
import type { Card } from '../lib/types'

const PAGE = 60

export function Search() {
  const { language } = useLanguage()
  const { user, setUser } = useAuth()
  const [query, setQuery] = useState('')
  const [cards, setCards] = useState<Card[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [typing, setTyping] = useState(false)

  /* Seeded from the account: it opens on the edition set in the log book, and on the
     number of columns chosen there. Changing the edition here is a change of mind
     about this search; changing the columns is a taste, and that one is written back. */
  const [filters, setFilters] = useState<FilterState>({
    language,
    ...EMPTY,
    sort: 'code',
    columns: user?.grid_columns ?? 2,
  })

  const params = () => ({
    q: query || undefined,
    language: filters.language ?? undefined,
    rarity: filters.rarities,
    color: filters.colors,
    owned: filters.owned ?? undefined,
    sort: filters.sort,
    limit: PAGE,
  })

  useEffect(() => {
    // Debounced: a keystroke should not fire a query against 9,447 rows.
    const timer = setTimeout(() => {
      setLoading(true)
      setFailed(false)
      api
        .cards(params())
        .then((page) => {
          setCards(page.items)
          setTotal(page.total)
        })
        .catch(() => setFailed(true))
        .finally(() => setLoading(false))
    }, 220)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filters])

  const loadMore = () => {
    if (cards.length >= total || loading) return
    api
      .cards({ ...params(), offset: cards.length })
      .then((page) =>
        setCards((current) => (current.length >= total ? current : [...current, ...page.items])),
      )
      .catch(() => {})
  }

  const change = (next: FilterState) => {
    setFilters(next)
    /* The column count is the one part of this panel that is a lasting preference
       rather than a question about this search, so it follows the account. Fire and
       forget: the grid has already reflowed, and a failed write should cost the next
       reload rather than this tap. */
    if (next.columns !== filters.columns) {
      api.updateProfile({ grid_columns: next.columns }).then(setUser).catch(() => {})
    }
  }

  const clear = () => setFilters({ ...filters, language: null, ...EMPTY })

  const applied = appliedLabels(filters)

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Recherche"
        meta={loading ? 'Recherche…' : `${total.toLocaleString('fr')} carte${total > 1 ? 's' : ''}`}
      />

      <div className="relative flex items-center gap-2.5 px-5 pb-3">
        <div
          className="flex min-h-[46px] min-w-0 flex-1 items-center gap-2.5 rounded-full px-4"
          style={{ background: 'var(--surface-recessed)' }}
        >
          <SearchIcon className="size-4 shrink-0 text-[var(--text-faint)]" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setTyping(true)
            }}
            onFocus={() => setTyping(true)}
            placeholder="Nom ou code (OP09-093)"
            aria-label="Rechercher une carte"
            className="min-w-0 flex-1 bg-transparent py-2.5 outline-none placeholder:text-[var(--text-faint)]"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                setTyping(false)
              }}
              aria-label="Effacer la recherche"
              className="-mr-2 flex size-[var(--touch)] shrink-0 items-center justify-center text-lg text-[var(--text-faint)]"
            >
              ×
            </button>
          )}
        </div>

        <button
          onClick={() => setFiltersOpen(true)}
          aria-haspopup="dialog"
          aria-label={applied.length ? `Filtres actifs : ${applied.join(', ')}` : 'Filtres'}
          className="relative grid size-[46px] shrink-0 place-items-center rounded-full"
          style={{
            background: isFiltered(filters) ? 'var(--gradient-sun)' : 'var(--surface-recessed)',
            color: isFiltered(filters) ? 'var(--color-paper-ink)' : 'var(--text-secondary)',
            boxShadow: isFiltered(filters) ? 'var(--shadow-action)' : 'none',
          }}
        >
          <FilterIcon className="size-[18px]" />
        </button>

        {typing && query.trim().length > 0 && !loading && (
          <Suggestions cards={cards} query={query} onDismiss={() => setTyping(false)} />
        )}
      </div>

      {applied.length > 0 && (
        <div className="flex items-center gap-2 px-5 pb-3">
          <p className="t-code min-w-0 flex-1 truncate text-sun-500">{applied.join(' · ')}</p>
          <button onClick={clear} className="t-code min-h-[var(--touch)] shrink-0 px-2">
            Tout effacer
          </button>
        </div>
      )}

      {failed ? (
        <div className="pt-8">
          <Adrift onRetry={() => setQuery((q) => q)} />
        </div>
      ) : loading && cards.length === 0 ? (
        <div className="pt-8">
          <Sounding label="Sondage du catalogue" />
        </div>
      ) : cards.length === 0 ? (
        <div className="pt-8">
          <EmptyState title="Aucun résultat">
            Aucune carte ne correspond. Retire un filtre ou vérifie le code.
          </EmptyState>
        </div>
      ) : (
        <CardGrid
          cards={cards}
          columns={filters.columns}
          onEndReached={loadMore}
          loadingMore={cards.length < total}
          showArt
        />
      )}

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        state={filters}
        onChange={change}
        onClear={clear}
        total={total}
        loading={loading}
      />
    </div>
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
