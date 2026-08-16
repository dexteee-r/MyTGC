import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Edition } from '../components/Edition'
import { Sky } from '../components/Sky'
import { Spinner } from '../components/ui'
import { ApiError, api, imageUrl } from '../lib/api'
import { money } from '../lib/money'
import type { SharedWishlist as SharedWishlistData, SharedWishlistEntry } from '../lib/types'

const PRIORITY: Record<number, string> = {
  1: 'Dès que possible',
  2: 'Si ça se présente',
  3: 'Un jour',
}

/* A plain list rather than the app's own wanted-poster treatment: that page is a
   lot of surface (torn edges, a halftone screen, a red stamp) built for someone
   managing their own hunt, and a stranger reading a link only needs the facts --
   what is wanted, how badly, and what it went for where it was seen. */
export function SharedWishlist() {
  const { token = '' } = useParams()
  const [data, setData] = useState<SharedWishlistData | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    api
      .sharedWishlist(token)
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
                {data.owner_name ? `Recherchées de ${data.owner_name}` : 'Des cartes recherchées'}
              </h1>
              <p className="pt-2 t-code text-[var(--text-secondary)]">
                {data.entries.length} carte{data.entries.length > 1 ? 's' : ''}
              </p>

              {data.entries.length === 0 ? (
                <p className="pt-8 text-sm text-[var(--text-secondary)]">Rien de recherché ici.</p>
              ) : (
                <ul className="mt-6 space-y-2.5">
                  {data.entries.map((entry) => (
                    <Row key={`${entry.card_id}-${entry.language}`} entry={entry} />
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

function Row({ entry }: { entry: SharedWishlistEntry }) {
  const src = entry.card ? imageUrl(entry.card) : null
  return (
    <li
      className="flex items-center gap-3 rounded-[14px] p-3"
      style={{ background: 'var(--surface-recessed)' }}
    >
      {src ? (
        <img src={src} alt="" decoding="async" className="h-16 w-[46px] shrink-0 object-cover" />
      ) : (
        <div className="sunken h-16 w-[46px] shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{entry.card?.name ?? entry.card_id}</p>
        <p className="t-code pt-1 text-[var(--text-faint)]">
          {PRIORITY[entry.priority]} · <Edition language={entry.language} />
        </p>
      </div>
      {entry.price != null && (
        <p className="t-numeral shrink-0 text-[1.05rem]">{money(entry.price)}</p>
      )}
    </li>
  )
}
