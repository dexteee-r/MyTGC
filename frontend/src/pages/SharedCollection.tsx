import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError, api, imageUrl } from '../lib/api'
import { Sky } from '../components/Sky'
import { Spinner } from '../components/ui'
import type { SharedCollection as SharedCollectionData, SharedCollectionEntry } from '../lib/types'

/* ── Someone else's binder, through the glass ────────────────────────────────
   Reached from a link, never from the tab bar — a stranger arriving here has no
   account and no CollectionProvider, so this does not reuse CardGrid: that
   component reads the *viewer's own* ownership from context, which would be
   either absent (no provider outside the signed-in Shell) or wrong (the
   viewer's badges painted over someone else's list). A personal collection is
   small — the same reasoning that already justifies holding it all in memory for
   the owner's own screens — so a plain, unvirtualised grid costs nothing here. */

export function SharedCollection() {
  const { token = '' } = useParams()
  const [data, setData] = useState<SharedCollectionData | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    api
      .sharedCollection(token)
      .then(setData)
      .catch((error) => setNotFound(error instanceof ApiError && error.status === 404))
  }, [token])

  return (
    <div className="relative h-full overflow-hidden">
      <Sky variant="dawn" quiet />
      <div className="relative z-[1] h-full overflow-y-auto" style={{ color: 'var(--text-primary)' }}>
        <div className="mx-auto max-w-2xl px-5 pt-10 pb-14">
          <p className="t-eyebrow">MyTCG</p>

          {notFound ? (
            <>
              <h1 className="t-display pt-2 text-[1.75rem]">Lien introuvable</h1>
              <p className="pt-3 text-sm text-[var(--text-secondary)]">
                Ce lien n'existe plus, ou son propriétaire a désactivé le partage.
              </p>
            </>
          ) : !data ? (
            <div className="pt-14">
              <Spinner />
            </div>
          ) : (
            <>
              <h1 className="t-display pt-2 text-[1.75rem]">
                {data.owner_name ? `Collection de ${data.owner_name}` : 'Une collection'}
              </h1>
              <p className="pt-2 t-code text-[var(--text-secondary)]">
                {data.entries.length} référence{data.entries.length > 1 ? 's' : ''}
              </p>

              {data.entries.length === 0 ? (
                <p className="pt-8 text-sm text-[var(--text-secondary)]">
                  Rien n'est encore rangé ici.
                </p>
              ) : (
                <ul className="mt-6 grid grid-cols-3 gap-1.5 lg:grid-cols-6">
                  {data.entries.map((entry) => (
                    <Tile key={`${entry.card_id}-${entry.language}`} entry={entry} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* Same visual language as Collection.tsx's own Seated tile -- the quantity badge
   only when it says something ("1" on every card is noise) -- but not a link:
   /card/:id belongs to the viewer's own signed-in account, and pointing a
   stranger at it would open a page scoped to a collection they do not have. */
function Tile({ entry }: { entry: SharedCollectionEntry }) {
  const src = entry.card ? imageUrl(entry.card) : null
  return (
    <li className="relative">
      {src ? (
        <img
          src={src}
          alt={entry.card?.name ?? entry.card_id}
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
    </li>
  )
}
