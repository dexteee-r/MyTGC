import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Edition } from '../components/Edition'
import { Button, ColorBar, EmptyState, PageHeader, Screen, Spinner } from '../components/ui'
import { api, imageUrl } from '../lib/api'
import { useToast } from '../lib/toast'
import type { WishlistEntry } from '../lib/types'

/* The want list: what a collector is hunting, as opposed to what they hold.

   Priority is three steps rather than ten. A longer scale only invites agonising
   over whether something is a 6 or a 7, and the answer never changes what you do
   when you are standing in a shop. */
const PRIORITY: Record<number, string> = {
  1: 'Dès que possible',
  2: 'Si ça se présente',
  3: 'Un jour',
}

export function Wishlist() {
  const { show } = useToast()
  const [entries, setEntries] = useState<WishlistEntry[] | null>(null)

  const load = useCallback(() => {
    api.wishlist().then(setEntries).catch(() => setEntries([]))
  }, [])
  useEffect(load, [load])

  const remove = async (entry: WishlistEntry) => {
    setEntries((current) => (current ?? []).filter((e) => e.id !== entry.id))
    await api.removeFromWishlist(entry.id).catch(load)
    show(`${entry.card?.name ?? entry.card_id} retirée`)
  }

  const setPriority = async (entry: WishlistEntry, priority: number) => {
    setEntries((current) =>
      (current ?? []).map((e) => (e.id === entry.id ? { ...e, priority } : e)),
    )
    await api.updateWishlist(entry.id, { priority }).catch(load)
  }

  if (!entries) return <Spinner />

  return (
    <Screen>
      <PageHeader
        title="Recherchées"
        meta={entries.length ? `${entries.length} carte${entries.length > 1 ? 's' : ''}` : undefined}
      />

      {entries.length === 0 ? (
        <div className="pt-8">
          <EmptyState
            title="Aucune carte recherchée"
            action={
              <Link to="/search">
                <Button size="lg">Parcourir le catalogue</Button>
              </Link>
            }
          >
            Marque une carte comme recherchée depuis sa fiche pour la retrouver ici.
          </EmptyState>
        </div>
      ) : (
        <ul>
          {entries.map((entry) => {
            const src = entry.card ? imageUrl(entry.card) : null
            return (
              <li key={entry.id} className="cut p-3">
                <div className="flex items-start gap-3">
                  <Link
                    to={`/card/${encodeURIComponent(entry.card_id)}?language=${entry.language}`}
                  >
                    {src ? (
                      <img
                        src={src}
                        alt=""
                        className="h-[68px] w-[49px] rounded-[0.25rem] object-cover"
                      />
                    ) : (
                      <div className="niche h-[68px] w-[49px]" />
                    )}
                  </Link>
                  <ColorBar
                    colors={entry.card?.colors ?? []}
                    className="h-11 w-[3px] shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="t-plate truncate">{entry.card?.name ?? entry.card_id}</p>
                    <p className="t-code pt-1">
                      {entry.card_id} · <Edition language={entry.language} />
                    </p>
                    {entry.notes && (
                      <p className="truncate pt-1 text-xs text-carve-dim">{entry.notes}</p>
                    )}
                  </div>
                  <button
                    onClick={() => remove(entry)}
                    aria-label="Retirer de la liste"
                    className="size-11 shrink-0 text-xl text-carve-faint"
                  >
                    ×
                  </button>
                </div>

                <div className="mt-3 flex wall gap-px">
                  {[1, 2, 3].map((level) => (
                    <button
                      key={level}
                      onClick={() => setPriority(entry, level)}
                      aria-pressed={entry.priority === level}
                      /* Raised and lettered in brass, not filled with it. A gold
                         slab on every row turns the one accent into a colour
                         scheme, and the list stops having a focal point. */
                      style={{
                        boxShadow: entry.priority === level ? 'var(--relief)' : 'var(--groove)',
                      }}
                      className={`min-h-9 flex-1 px-2 text-xs transition ${
                        entry.priority === level
                          ? 'bg-stone-lit font-semibold text-brass'
                          : 'bg-niche text-carve-faint'
                      }`}
                    >
                      {PRIORITY[level]}
                    </button>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Screen>
  )
}
