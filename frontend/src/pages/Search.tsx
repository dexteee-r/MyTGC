import { useEffect, useRef, useState } from 'react'
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
import { SearchHistoryUI } from '../components/SearchHistoryUI'
import { useSearchHistory } from '../lib/useSearchHistory'

const PAGE = 60

/* Where the search was left. Opening a card unmounts this screen — it is a route, and
   the grid is virtualised against its own scroll element — so without this, coming
   back re-ran the query, dropped every page loaded past the first, and reopened at the
   top with the filters cleared. Hunting a card means going in and out of sheets, so
   that is the common path, not an edge case.

   A module variable rather than storage: this is where you were a moment ago, not
   something to remember about you. It dies with the tab, and the contract keeps
   anything worth persisting on the account instead. */
let left: {
  query: string
  filters: FilterState
  cards: Card[]
  total: number
  scroll: number
} | null = null

export function Search() {
  const { language } = useLanguage()
  const { user, setUser } = useAuth()
  const { history, addSearch } = useSearchHistory()
  const [query, setQuery] = useState(left?.query ?? '')
  const [cards, setCards] = useState<Card[]>(left?.cards ?? [])
  const [total, setTotal] = useState(left?.total ?? 0)
  const [loading, setLoading] = useState(!left)
  const [failed, setFailed] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [typing, setTyping] = useState(false)

  /* Seeded from the account: it opens on the edition set in the log book, and on the
     number of columns chosen there. Changing the edition here is a change of mind
     about this search; changing the columns is a taste, and that one is written back. */
  const [filters, setFilters] = useState<FilterState>(
    left?.filters ?? {
      language,
      ...EMPTY,
      sort: 'code',
      columns: user?.grid_columns ?? 2,
    },
  )
  const scroll = useRef(left?.scroll ?? 0)

  /* The first render after a return already holds the answer; refetching it would
     throw away every page past the first and put the reader back at the top, which is
     the bug this exists to fix. Cleared immediately, so changing a filter still runs. */
  const returning = useRef(Boolean(left))

  useEffect(() => () => {
    left = { query, filters, cards, total, scroll: scroll.current }
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

  const runSearch = () => {
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
  }

  useEffect(() => {
    if (returning.current) {
      returning.current = false
      return
    }
    // Debounced: a keystroke should not fire a query against 9,447 rows.
    const timer = setTimeout(runSearch, 220)
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

  /* Back to the baseline, which includes the edition set on the account — not to both
     editions. Clearing filters is "show me the usual", and the usual is one edition;
     the catalogue holds every card twice, so falling back to both silently doubled the
     results and paired every card with a printing you cannot read. */
  const clear = () => setFilters({ ...filters, language, ...EMPTY })

  const applied = appliedLabels(filters, language)

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
            // Le blur ferme après un court délai, pour laisser un clic sur une
            // suggestion ou un item de l'historique se produire avant.
            onBlur={() => setTimeout(() => setTyping(false), 200)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim()) {
                addSearch(query)
                setTyping(false)
              }
            }}
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
            background: isFiltered(filters, language) ? 'var(--gradient-sun)' : 'var(--surface-recessed)',
            color: isFiltered(filters, language) ? 'var(--color-paper-ink)' : 'var(--text-secondary)',
            boxShadow: isFiltered(filters, language) ? 'var(--shadow-action)' : 'none',
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

      {typing && query.trim().length === 0 ? (
        <div className="px-5">
          <SearchHistoryUI
            history={history}
            onSelectHistory={(q) => {
              setQuery(q)
              addSearch(q)
              setTyping(false)
            }}
          />
        </div>
      ) : failed ? (
        <div className="pt-8">
          <Adrift onRetry={runSearch} />
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
          initialScroll={scroll.current}
          onScroll={(top) => {
            scroll.current = top
          }}
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
