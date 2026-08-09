import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Button,
  EmptyState,
  PageHeader,
  Screen,
  Segmented,
  Sounding,
} from '../components/ui'
import { imageUrl } from '../lib/api'
import { useCollection } from '../lib/collection'
import type { CollectionEntry } from '../lib/types'

type Sort = 'recent' | 'set' | 'name'

/* ── The plate ──────────────────────────────────────────────────────────────
   The collection as an object rather than as an inventory. A list row gives one card
   145px of screen to say a name and a number you already know; three across gives
   the same screen eight cards you can recognise, which is what looking at a
   collection is for.

   Whole cards, watermark included. The SAMPLE across the middle is a property of the
   material, not a defect to crop out, and it is the full portrait silhouette that
   makes a plate read as a page rather than as a row of tiles.                       */

export function Collection() {
  const { entries, stats, ready } = useCollection()
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

  if (!ready) return <div className="pt-10"><Sounding label="Ouverture du journal" /></div>

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
                <p className="t-code border-b border-[rgba(243,230,203,.12)] px-4 py-2.5">{group.key}</p>
              )}
              {/* align-content: start. At 0.8% of the catalogue the last row is
                  always partial, and a stretched grid would centre three cards in
                  the middle of an empty band as though something had failed. */}
              <ul
                className="grid grid-cols-3 content-start gap-1.5 px-4 pb-2 lg:grid-cols-6"
              >
                {group.items.map((entry) => (
                  <Seated key={`${entry.card_id}-${entry.language}`} entry={entry} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </Screen>
  )
}

/* One card on the plate. The quantity is only worth saying when it is more than one —
   a "1" on every card is noise on a screen whose whole job is showing what you hold. */
function Seated({ entry }: { entry: CollectionEntry }) {
  const src = entry.card ? imageUrl(entry.card) : null
  return (
    <li className="relative">
      <Link
        to={`/card/${encodeURIComponent(entry.card_id)}?language=${entry.language}`}
        aria-label={`${entry.card?.name ?? entry.card_id}, ${entry.quantity} en collection`}
        className="block"
      >
        {src ? (
          <img
            src={src}
            alt=""
            decoding="async"
            className="float aspect-[600/838] w-full object-cover"
          />
        ) : (
          <div className="sunken aspect-[600/838] w-full" />
        )}
        {entry.quantity > 1 && (
          <span
            className="t-numeral absolute right-0 bottom-0 px-1.5 py-0.5 text-[0.7rem]"
            style={{ background: 'rgba(4,18,26,.86)' }}
          >
            ×{entry.quantity}
          </span>
        )}
      </Link>
    </li>
  )
}
