import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CardGrid } from '../components/CardGrid'
import { ChevronLeftIcon } from '../components/icons'
import { CompletionRing, EmptyState, ErrorState, Segmented, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useCollection } from '../lib/collection'
import type { Card, Language } from '../lib/types'

const PAGE = 60
type View = 'all' | 'missing' | 'owned'

/* "What am I still missing in OP-13" is the question a collector opens a set to
   answer, so it is a first-class filter.

   It filters server-side. Doing it on the loaded page was wrong twice over: the
   header contradicted the count on the Extensions list, and "Possédées" looked
   empty whenever the owned cards happened to sit past the first 60 by id. */
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

  const filter = { pack_code: packCode, language, ...(view === 'all' ? {} : { owned: view === 'owned' }) }

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

  // The set's true size and holdings, independent of the current filter, so the
  // ring agrees with the Extensions list. Re-runs when the collection changes.
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
        setCards((current) =>
          current.length >= total ? current : [...current, ...page.items],
        ),
      )
      .catch(() => {})
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 px-3 pt-4 pb-3">
        <Link
          to="/packs"
          aria-label="Revenir aux extensions"
          className="flex size-11 items-center justify-center rounded-full text-foam-dim"
        >
          <ChevronLeftIcon className="size-6" />
        </Link>
        <CompletionRing value={ownedTotal} total={setSize} size={40} />
        <div className="min-w-0 flex-1">
          <h1 className="voice-display truncate text-xl">{packCode}</h1>
          <p className="voice-data text-sm text-foam-faint">
            {ownedTotal} / {setSize} · {language === 'en' ? 'International' : 'Japon'}
          </p>
        </div>
      </header>

      <div className="px-5 pb-3">
        <Segmented
          value={view}
          options={[
            { value: 'all', label: 'Toutes' },
            { value: 'missing', label: 'Manquantes' },
            { value: 'owned', label: 'Possédées' },
          ]}
          onChange={setView}
          label="Filtrer par possession"
        />
      </div>

      {failed ? (
        <ErrorState onRetry={() => setView(view)} />
      ) : loading ? (
        <Spinner />
      ) : cards.length === 0 ? (
        <EmptyState
          title={view === 'owned' ? 'Aucune carte possédée' : 'Extension complète'}
        >
          {view === 'owned'
            ? "Tu n'as encore rien de cette extension. Scanne une carte pour commencer."
            : 'Tu possèdes toute l’extension. Beau travail.'}
        </EmptyState>
      ) : (
        <CardGrid
          cards={cards}
          onEndReached={loadMore}
          loadingMore={cards.length < total}
        />
      )}
    </div>
  )
}
