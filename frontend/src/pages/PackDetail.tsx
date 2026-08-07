import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CardGrid } from '../components/CardGrid'
import { ChevronLeftIcon } from '../components/icons'
import { EmptyState, ErrorState, Segmented, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useCollection } from '../lib/collection'
import type { Card, Language } from '../lib/types'

const PAGE = 60
type View = 'all' | 'missing' | 'owned'

/* One divider, opened. The page shows every slot in the set — the ones you hold as
   cards, the ones you do not as empty pockets — so "what am I missing" is answered
   by looking rather than by filtering. The filter is still there for when the set is
   large enough that looking is not enough.

   Filtering happens server-side. Doing it on the loaded page made the header
   disagree with the list of dividers, and left "Possédées" empty whenever the cards
   held happened to sit past the first sixty by number. */
export function PackDetail() {
  const { packCode = '' } = useParams()
  const [params] = useSearchParams()
  const language = (params.get('language') ?? 'en') as Language
  const { entries } = useCollection()

  const [cards, setCards] = useState<Card[]>([])
  const [total, setTotal] = useState(0)
  const [setSize, setSetSize] = useState(0)
  const [ownedTotal, setOwnedTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState<View>('all')

  const filter = {
    pack_code: packCode,
    language,
    ...(view === 'all' ? {} : { owned: view === 'owned' }),
  }

  useEffect(() => {
    setLoading(true)
    setFailed(false)
    setCards([])
    api
      .cards({ ...filter, limit: PAGE })
      .then((page) => {
        setCards(page.items)
        setTotal(page.total)
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packCode, language, view])

  useEffect(() => {
    Promise.all([
      api.cards({ pack_code: packCode, language, limit: 1 }),
      api.cards({ pack_code: packCode, language, owned: true, limit: 1 }),
    ])
      .then(([all, owned]) => {
        setSetSize(all.total)
        setOwnedTotal(owned.total)
      })
      .catch(() => {})
  }, [packCode, language, entries])

  const loadMore = () => {
    if (cards.length >= total || loading) return
    api
      .cards({ ...filter, limit: PAGE, offset: cards.length })
      .then((page) =>
        setCards((current) => (current.length >= total ? current : [...current, ...page.items])),
      )
      .catch(() => {})
  }

  return (
    <div className="flex h-full flex-col">
      <header className="cut px-2 pt-4 pb-3">
        <div className="flex items-center gap-1">
          <Link
            to="/packs"
            aria-label="Revenir aux extensions"
            className="flex size-11 items-center justify-center text-carve-dim"
          >
            <ChevronLeftIcon className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="t-stat truncate text-xl">{packCode}</h1>
          </div>
          <span className="t-stat pr-3 text-lg">
            {ownedTotal}
            <span className="text-carve-faint">/{setSize}</span>
          </span>
        </div>
        <div className="channel mt-3 ml-2 w-[calc(100%-1rem)]">
          <div
            
            style={{ width: setSize ? `${(ownedTotal / setSize) * 100}%` : 0 }}
          />
        </div>
      </header>

      <Segmented
        value={view}
        options={[
          { value: 'all', label: 'La page' },
          { value: 'missing', label: 'Manquantes' },
          { value: 'owned', label: 'Possédées' },
        ]}
        onChange={setView}
        label="Filtrer"
      />

      {failed ? (
        <div className="pt-8"><ErrorState onRetry={() => setView(view)} /></div>
      ) : loading ? (
        <Spinner />
      ) : cards.length === 0 ? (
        <div className="pt-8">
          <EmptyState title={view === 'owned' ? 'Aucune carte de cette extension' : 'Extension complète'}>
            {view === 'owned'
              ? 'Scanne une carte pour commencer cette page.'
              : 'Toutes les pochettes sont pleines.'}
          </EmptyState>
        </div>
      ) : (
        <CardGrid cards={cards} onEndReached={loadMore} loadingMore={cards.length < total} />
      )}
    </div>
  )
}
