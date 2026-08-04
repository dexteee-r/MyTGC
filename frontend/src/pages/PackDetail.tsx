import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CardGrid } from '../components/CardGrid'
import { ChevronLeftIcon } from '../components/icons'
import { Spinner } from '../components/ui'
import { api } from '../lib/api'
import type { Card, Language } from '../lib/types'

const PAGE = 60

export function PackDetail() {
  const { packCode = '' } = useParams()
  const [params] = useSearchParams()
  const language = (params.get('language') ?? 'en') as Language
  const navigate = useNavigate()

  const [cards, setCards] = useState<Card[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setCards([])
    api
      .cards({ pack_code: packCode, language, limit: PAGE })
      .then((page) => {
        setCards(page.items)
        setTotal(page.total)
      })
      .finally(() => setLoading(false))
  }, [packCode, language])

  const loadMore = () => {
    if (cards.length >= total) return
    api
      .cards({ pack_code: packCode, language, limit: PAGE, offset: cards.length })
      .then((page) =>
        setCards((current) =>
          // Guard against a late response duplicating rows already appended.
          current.length >= total ? current : [...current, ...page.items],
        ),
      )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 px-3 pt-4 pb-2">
        <button onClick={() => navigate(-1)} className="p-2 text-ink-soft">
          <ChevronLeftIcon className="size-6" />
        </button>
        <div className="min-w-0">
          <h1 className="display-title truncate text-2xl">{packCode}</h1>
          <p className="text-sm text-ink-soft">
            {total} cartes · {language === 'en' ? 'International' : 'Japon'}
          </p>
        </div>
      </header>
      {loading ? <Spinner /> : <CardGrid cards={cards} onEndReached={loadMore} />}
    </div>
  )
}
