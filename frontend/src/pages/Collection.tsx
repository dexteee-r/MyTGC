import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Edition } from '../components/Edition'
import {
  Button,
  ColorBar,
  EmptyState,
  PageHeader,
  Screen,
  Segmented,
  Spinner,
  Stepper,
} from '../components/ui'
import { imageUrl } from '../lib/api'
import { useCollection } from '../lib/collection'
import { CONDITION_LABELS } from '../lib/types'

type Sort = 'recent' | 'set' | 'name'

export function Collection() {
  const { entries, stats, ready, setQuantity } = useCollection()
  const [sort, setSort] = useState<Sort>('recent')

  const groups = useMemo(() => {
    const sorted = [...entries]
    if (sort === 'name') {
      sorted.sort((a, b) => (a.card?.name ?? a.card_id).localeCompare(b.card?.name ?? b.card_id))
    } else if (sort === 'set') {
      sorted.sort((a, b) => (a.card?.pack_code ?? 'zz').localeCompare(b.card?.pack_code ?? 'zz'))
    }
    if (sort !== 'set') return [{ key: '', items: sorted }]

    const buckets = new Map<string, typeof sorted>()
    for (const entry of sorted) {
      const key = entry.card?.pack_code ?? 'Sans extension'
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key)!.push(entry)
    }
    return [...buckets].map(([key, items]) => ({ key, items }))
  }, [entries, sort])

  if (!ready) return <Spinner />

  return (
    <Screen>
      <PageHeader
        title="Collection"
        meta={
          stats
            ? `${stats.total_quantity} cartes · ${stats.distinct_cards} références`
            : undefined
        }
      />

      {entries.length === 0 ? (
        <div className="pt-8">
          <EmptyState
            title="Rien de rangé pour le moment"
            action={
              <Link to="/scan">
                <Button size="lg">Scanner une carte</Button>
              </Link>
            }
          >
            Scanne une carte, ou ajoute-la depuis sa fiche.
          </EmptyState>
        </div>
      ) : (
        <>
          <Segmented
            value={sort}
            options={[
              { value: 'recent', label: 'Récentes' },
              { value: 'set', label: 'Par extension' },
              { value: 'name', label: 'A → Z' },
            ]}
            onChange={setSort}
            label="Trier"
          />

          {groups.map((group) => (
            <section key={group.key}>
              {group.key && (
                <p className="t-code cut px-4 py-2.5">{group.key}</p>
              )}
              <ul>
                {group.items.map((entry) => {
                  const src = entry.card ? imageUrl(entry.card) : null
                  return (
                    <li
                      key={entry.id}
                      className="flex items-center gap-3 cut p-3"
                    >
                      <Link
                        to={`/card/${encodeURIComponent(entry.card_id)}?language=${entry.language}`}
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        {src ? (
                          <img
                            src={src}
                            alt=""
                            className="h-[68px] w-[49px] shrink-0 rounded-[0.25rem] object-cover"
                          />
                        ) : (
                          <div className="niche h-[68px] w-[49px] shrink-0" />
                        )}
                        <ColorBar
                          colors={entry.card?.colors ?? []}
                          className="h-11 w-[3px] shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="t-plate truncate">
                            {entry.card?.name ?? entry.card_id}
                          </p>
                          <p className="t-code pt-1">
                            {entry.card_id} · <Edition language={entry.language} />
                          </p>
                          {entry.condition && (
                            <p className="truncate pt-0.5 text-xs text-carve-dim">
                              {CONDITION_LABELS[entry.condition]}
                            </p>
                          )}
                        </div>
                      </Link>
                      <Stepper
                        value={entry.quantity}
                        onChange={(next) => setQuantity(entry.card_id, entry.language, next)}
                      />
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </Screen>
  )
}
