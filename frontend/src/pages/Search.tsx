import { useEffect, useState } from 'react'
import { CardGrid } from '../components/CardGrid'
import { SearchIcon } from '../components/icons'
import { EmptyState, PageTitle, Segmented, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { LANGUAGE_OPTIONS, useLanguage } from '../lib/language'
import { COLOR_SWATCHES, type Card } from '../lib/types'

const PAGE = 60
const RARITIES = ['Common', 'Uncommon', 'Rare', 'SuperRare', 'SecretRare', 'Leader', 'Promo']

export function Search() {
  const { language, setLanguage } = useLanguage()
  const [query, setQuery] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [rarity, setRarity] = useState<string | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Debounced so a query is not fired on every keystroke against 9,447 rows.
    const timer = setTimeout(() => {
      setLoading(true)
      api
        .cards({
          q: query || undefined,
          language,
          color: color ?? undefined,
          rarity: rarity ?? undefined,
          limit: PAGE,
        })
        .then((page) => {
          setCards(page.items)
          setTotal(page.total)
        })
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(timer)
  }, [query, language, color, rarity])

  const loadMore = () => {
    if (cards.length >= total) return
    api
      .cards({
        q: query || undefined,
        language,
        color: color ?? undefined,
        rarity: rarity ?? undefined,
        limit: PAGE,
        offset: cards.length,
      })
      .then((page) =>
        setCards((current) =>
          current.length >= total ? current : [...current, ...page.items],
        ),
      )
  }

  return (
    <div className="flex h-full flex-col">
      <PageTitle>Recherche</PageTitle>

      <div className="px-5 pb-3">
        <div className="flex items-center gap-2 rounded-full bg-surface px-4 py-3 shadow-sm">
          <SearchIcon className="size-5 text-ink-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nom de carte ou code (OP09-093)…"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-faint"
          />
        </div>
      </div>

      <div className="px-5 pb-2">
        <Segmented value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} />
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-2">
        {Object.entries(COLOR_SWATCHES).map(([name, hex]) => (
          <button
            key={name}
            onClick={() => setColor(color === name ? null : name)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
              color === name ? 'bg-ink text-white' : 'bg-surface text-ink-soft'
            }`}
          >
            <span className="size-2.5 rounded-full" style={{ background: hex }} />
            {name}
          </button>
        ))}
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-3">
        {RARITIES.map((name) => (
          <button
            key={name}
            onClick={() => setRarity(rarity === name ? null : name)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm transition ${
              rarity === name ? 'bg-ink text-white' : 'bg-surface text-ink-soft'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      <p className="px-5 pb-2 text-sm text-ink-faint">{total} résultats</p>

      {loading && cards.length === 0 ? (
        <Spinner />
      ) : cards.length === 0 ? (
        <EmptyState icon={<SearchIcon className="size-9" />}>
          Aucune carte ne correspond à ces critères.
        </EmptyState>
      ) : (
        <CardGrid cards={cards} onEndReached={loadMore} />
      )}
    </div>
  )
}
