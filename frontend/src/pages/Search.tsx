import { useEffect, useState } from 'react'
import { CardGrid } from '../components/CardGrid'
import { SearchIcon } from '../components/icons'
import {
  CARD_COLORS,
  Chip,
  EmptyState,
  ErrorState,
  PageHeader,
  Segmented,
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

  const active = Boolean(query || color || rarity || owned !== null)

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

      <div className="cut px-4 py-3">
        <div className="niche flex min-h-11 items-center gap-2.5 px-3">
          <SearchIcon className="size-4 shrink-0 text-carve-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nom ou code (OP09-093)"
            aria-label="Rechercher une carte"
            className="min-w-0 flex-1 bg-transparent py-2.5 outline-none placeholder:text-carve-faint"
          />
          {active && (
            <button
              onClick={() => {
                setQuery('')
                setColor(null)
                setRarity(null)
                setOwned(null)
              }}
              className="t-code shrink-0"
            >
              Effacer
            </button>
          )}
        </div>
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2.5">
        <Chip active={owned === true} onClick={() => setOwned(owned === true ? null : true)}>
          Possédées
        </Chip>
        <Chip active={owned === false} onClick={() => setOwned(owned === false ? null : false)}>
          Manquantes
        </Chip>
        <span className="w-px shrink-0 self-stretch bg-[#050403]" />
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
      </div>

      <div className="no-scrollbar flex gap-2 overflow-x-auto cut px-4 pb-3">
        {RARITIES.map((name) => (
          <Chip
            key={name}
            active={rarity === name}
            onClick={() => setRarity(rarity === name ? null : name)}
          >
            {name}
          </Chip>
        ))}
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
        <CardGrid cards={cards} onEndReached={loadMore} loadingMore={cards.length < total} />
      )}
    </div>
  )
}
