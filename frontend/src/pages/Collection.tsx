import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BoxIcon } from '../components/icons'
import { Button, EmptyState, PageTitle, Spinner } from '../components/ui'
import { api, imageUrl } from '../lib/api'
import { CONDITION_LABELS, type CollectionEntry, type CollectionStats } from '../lib/types'

export function Collection() {
  const [entries, setEntries] = useState<CollectionEntry[]>([])
  const [stats, setStats] = useState<CollectionStats | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = () =>
    Promise.all([api.collection(), api.collectionStats()]).then(([list, s]) => {
      setEntries(list)
      setStats(s)
    })

  useEffect(() => {
    reload().finally(() => setLoading(false))
  }, [])

  const changeQuantity = async (entry: CollectionEntry, delta: number) => {
    const quantity = entry.quantity + delta
    if (quantity <= 0) await api.removeFromCollection(entry.id)
    else await api.updateCollection(entry.id, { quantity })
    await reload()
  }

  if (loading) return <Spinner />

  return (
    <div className="no-scrollbar h-full overflow-y-auto pb-32">
      <PageTitle
        subtitle={
          stats
            ? `${stats.total_quantity} cartes · ${stats.distinct_cards} références`
            : undefined
        }
      >
        Collection
      </PageTitle>

      {entries.length === 0 ? (
        <EmptyState
          icon={<BoxIcon className="size-9" />}
          action={
            <Link to="/search">
              <Button>Parcourir le catalogue</Button>
            </Link>
          }
        >
          Ta collection est vide. Ajoute des cartes depuis leur fiche.
        </EmptyState>
      ) : (
        <ul className="space-y-3 px-5">
          {entries.map((entry) => {
            const src = entry.card ? imageUrl(entry.card) : null
            return (
              <li
                key={entry.id}
                className="flex items-center gap-3 rounded-(--radius-card) bg-surface p-3 shadow-sm"
              >
                <Link
                  to={`/card/${encodeURIComponent(entry.card_id)}?language=${entry.language}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  {src && (
                    <img
                      src={src}
                      alt=""
                      className="h-20 w-[57px] shrink-0 rounded-md object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {entry.card?.name ?? entry.card_id}
                    </p>
                    <p className="truncate text-sm text-ink-faint">
                      {entry.card_id} · {entry.language.toUpperCase()}
                    </p>
                    {entry.condition && (
                      <p className="mt-0.5 text-xs text-ink-soft">
                        {CONDITION_LABELS[entry.condition]}
                      </p>
                    )}
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  <QuantityButton onClick={() => changeQuantity(entry, -1)}>−</QuantityButton>
                  <span className="w-6 text-center font-semibold tabular-nums">
                    {entry.quantity}
                  </span>
                  <QuantityButton onClick={() => changeQuantity(entry, 1)}>+</QuantityButton>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function QuantityButton({
  children,
  onClick,
}: {
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="size-8 rounded-full bg-sunken text-lg leading-none font-semibold text-ink-soft active:scale-95"
    >
      {children}
    </button>
  )
}
