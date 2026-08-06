import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CameraIcon } from '../components/icons'
import {
  Button,
  ColorSpine,
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
            ? `${stats.total_quantity} carte${stats.total_quantity > 1 ? 's' : ''} · ${stats.distinct_cards} référence${stats.distinct_cards > 1 ? 's' : ''}`
            : undefined
        }
      />

      {entries.length === 0 ? (
        <EmptyState
          title="Collection vide"
          action={
            <Link to="/scan">
              <Button size="lg">
                <CameraIcon className="size-5" />
                Scanner une carte
              </Button>
            </Link>
          }
        >
          Scanne une carte, ou ajoute-la depuis sa fiche dans le catalogue.
        </EmptyState>
      ) : (
        <>
          <div className="px-5 pb-3">
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
          </div>

          {groups.map((group) => (
            <section key={group.key}>
              {group.key && <p className="voice-label px-5 pt-5 pb-2">{group.key}</p>}
              <ul className="space-y-2 px-5">
                {group.items.map((entry) => {
                  const src = entry.card ? imageUrl(entry.card) : null
                  return (
                    <li
                      key={entry.id}
                      className="flex items-center gap-3 rounded-(--radius-card) bg-sea-raised p-2.5"
                    >
                      <Link
                        to={`/card/${encodeURIComponent(entry.card_id)}?language=${entry.language}`}
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        {src && (
                          <img
                            src={src}
                            alt=""
                            className="h-[74px] w-[53px] shrink-0 rounded-md object-cover"
                          />
                        )}
                        <ColorSpine colors={entry.card?.colors ?? []} className="h-12" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {entry.card?.name ?? entry.card_id}
                          </p>
                          <p className="voice-data truncate text-sm text-foam-faint">
                            {entry.card_id} · {entry.language.toUpperCase()}
                          </p>
                          {entry.condition && (
                            <p className="truncate text-xs text-foam-dim">
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
