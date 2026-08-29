import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Edition, printingLabel } from '../components/Edition'
import {
  EMPTY,
  FilterSheet,
  PRIORITY_LABELS,
  appliedLabels,
  isFiltered,
  type FilterState,
} from '../components/Filters'
import { LinkIcon } from '../components/icons'
import { ShareDialog } from '../components/ShareDialog'
import { Button, EmptyState, PageHeader, Screen, Sounding } from '../components/ui'
import { api, imageUrl } from '../lib/api'
import { useToast } from '../lib/toast'
import type { WishlistEntry } from '../lib/types'
import { useWishlist } from '../lib/wishlist'

/* ── The hunt ───────────────────────────────────────────────────────────────
   The only screen made of paper in the whole app.

   A card you are hunting IS a wanted poster, so it is drawn as one: cream ground,
   torn edge, halftone screen, a WANTED banner, the bounty struck large, and a red
   stamp across the corner carrying how badly you want it. The break in value with
   every other screen is the point, not an accident — this is the one place the app
   stops being the sea.

   Each poster itself is drawn in CSS: the torn edge is a clip-path, the halftone is
   a repeating radial gradient. The page's own backdrop, since 2026-08-23, is a real
   photo of a wanted-poster wall (Sky's `image` prop) -- served from the backend's
   gitignored media directory the same way the sign-in hero is (see /media in
   main.py), never from the repository itself. The two stay distinct on purpose:
   licensed art can decorate the page without a single copyrighted pixel in git. */

/* The torn edge of a poster ripped off a wall. */
const TORN =
  'polygon(0 1%, 4% 0, 12% 1.2%, 26% .2%, 44% 1.4%, 62% .3%, 80% 1.3%, 94% .2%, 100% 1.4%, 100% 98.6%, 92% 100%, 76% 98.8%, 58% 99.8%, 40% 98.6%, 22% 99.8%, 8% 98.8%, 0 99.6%)'

const INK = '#221c12'

export function Wishlist() {
  const { show } = useToast()
  const { entries, ready, remove: removeFromWishlist, patch: patchWishlist } = useWishlist()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [filters, setFilters] = useState<FilterState>({
    language: null,
    ...EMPTY,
    sort: 'code',
    columns: 2,
  })

  /* Filtered in the browser rather than on the server: the want list is a handful of
     rows already in hand, and a round trip to narrow six posters would be slower than
     the tap that asked for it. Owned is dropped from the options — everything here is
     by definition not owned. */
  const shown = useMemo(() => {
    const list = entries.filter((entry) => {
      if (filters.language && entry.language !== filters.language) return false
      if (filters.rarities.length && !filters.rarities.includes(entry.card?.rarity ?? ''))
        return false
      if (
        filters.colors.length &&
        !(entry.card?.colors ?? []).some((c) => filters.colors.includes(c))
      )
        return false
      if (filters.priorities.length && !filters.priorities.includes(entry.priority))
        return false
      return true
    })
    const by = {
      code: (a: WishlistEntry, b: WishlistEntry) => a.card_id.localeCompare(b.card_id),
      name: (a: WishlistEntry, b: WishlistEntry) =>
        (a.card?.name ?? a.card_id).localeCompare(b.card?.name ?? b.card_id),
      /* By set code descending, the same order the catalogue search uses. */
      set: (a: WishlistEntry, b: WishlistEntry) =>
        (b.card?.pack_code ?? '').localeCompare(a.card?.pack_code ?? ''),
      /* Newest first, and the undated sets last rather than leading: an empty string
         sorts above every real date, which would put the promos at the top. */
      date: (a: WishlistEntry, b: WishlistEntry) =>
        (b.card?.release_date ?? '').localeCompare(a.card?.release_date ?? ''),
      /* The cote (market_price), not the price constaté hand-typed on the poster --
         asked and confirmed: "par prix" here means the market's number, the same one
         the catalogue already sorts by, not what someone jotted down themselves.
         Unpriced sinks to the bottom either direction, same reasoning as SORTS in
         main.py: absence is not a low price. */
      price_asc: (a: WishlistEntry, b: WishlistEntry) => {
        const pa = a.card?.market_price
        const pb = b.card?.market_price
        if (pa == null) return pb == null ? 0 : 1
        if (pb == null) return -1
        return pa - pb
      },
      price_desc: (a: WishlistEntry, b: WishlistEntry) => {
        const pa = a.card?.market_price
        const pb = b.card?.market_price
        if (pa == null) return pb == null ? 0 : 1
        if (pb == null) return -1
        return pb - pa
      },
    }[filters.sort]
    return [...list].sort(by)
  }, [entries, filters])

  const remove = async (entry: WishlistEntry) => {
    await removeFromWishlist(entry.id)
    show(`${entry.card?.name ?? entry.card_id} retirée`)
  }

  const clear = () => setFilters({ ...filters, language: null, ...EMPTY })
  const applied = appliedLabels(filters, null)

  if (!ready) return <Screen><div className="pt-10"><Sounding label="Relevé des primes" /></div></Screen>

return (
    <>
      <Screen className="scrollbar-desktop">
        <PageHeader
          title="Recherchées"
          meta={
            entries.length
              ? `${shown.length} sur ${entries.length} · avis de recherche`
              : 'avis de recherche'
          }
          action={
            entries.length > 0 ? (
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => setShareOpen(true)}
                  aria-label="Partager mes recherchées"
                  className="grid size-[46px] place-items-center rounded-full"
                  style={{ background: 'rgba(34,28,18,.1)' }}
                >
                  <LinkIcon className="size-[18px]" />
                </button>
                <button
                  onClick={() => setFiltersOpen(true)}
                  aria-haspopup="dialog"
                  aria-label={
                    applied.length ? `Filtres actifs : ${applied.join(', ')}` : 'Filtres'
                  }
                  className="grid size-[46px] place-items-center rounded-full"
                  style={{
                    background: isFiltered(filters, null)
                      ? 'var(--gradient-sun)'
                      : 'rgba(34,28,18,.1)',
                    color: isFiltered(filters, null) ? 'var(--color-paper-ink)' : 'inherit',
                  }}
                >
                  <svg viewBox="0 0 20 20" fill="none" className="size-[18px]" aria-hidden>
                    <path
                      d="M3 5h14M6 10h8M8.5 15h3"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>
            ) : undefined
          }
        />

        {/* Not wrapped in the page's own ink theme: Dialog carries its own theme
            isolation (see ui.tsx, OVERLAY_THEME), the same one every other overlay
            in the app uses, and this is the one screen where the surrounding page
            colours would otherwise leak the wrong way in. */}
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          title="Partager mes recherchées"
          description="Un lien en lecture seule vers ce que tu cherches — priorité et prix constaté inclus, jamais tes notes ni ton seuil d'alerte. N'importe qui avec ce lien peut le consulter, sans compte."
          fetchStatus={api.wishlistShareStatus}
          enable={api.enableWishlistShare}
          disable={api.disableWishlistShare}
          publicPath={(token) => `/shared/wishlist/${token}`}
        />

        {applied.length > 0 && (
          <div className="flex items-center gap-2 px-5 pb-2">
            <p className="t-code min-w-0 flex-1 truncate">{applied.join(' · ')}</p>
            <button onClick={clear} className="t-code min-h-[var(--touch)] shrink-0 px-2">
              Tout effacer
            </button>
          </div>
        )}

        {entries.length === 0 ? (
          <div className="pt-4">
            <EmptyState
              title="Aucun avis affiché"
              action={
                <Link to="/search">
                  <Button>Parcourir le catalogue</Button>
                </Link>
              }
            >
              Marque une carte comme recherchée depuis sa fiche et son avis s'affichera ici.
            </EmptyState>
          </div>
        ) : (
          <ul className="px-4 pt-1 lg:grid lg:grid-cols-3 lg:gap-5 lg:px-6">
            {shown.map((entry) => (
              <Poster
                key={`${entry.card_id}-${entry.language}`}
                entry={entry}
                onRemove={() => remove(entry)}
                onPatch={(change) => patchWishlist(entry.id, change)}
              />
            ))}
          </ul>
        )}
      </Screen>

      {/* Sorti de Screen : celui-ci scrolle avec overflow-y-auto, un terrain connu pour
          piéger un position:fixed sur iOS Safari, et le sheet en est un. La div
          text-white qui l'enveloppe ramène le texte clair, pour ne pas hériter la
          couleur INK des posters de la page. */}
      <div className="text-white">
        <FilterSheet
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          state={filters}
          onChange={setFilters}
          onClear={clear}
          total={shown.length}
          columns={false}
          owned={false}
          priority
        />
      </div>
    </>
  )
}

function Poster({
  entry,
  onRemove,
  onPatch,
}: {
  entry: WishlistEntry
  onRemove: () => void
  onPatch: (change: Partial<WishlistEntry>) => void
}) {
  const src = entry.card ? imageUrl(entry.card) : null
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(entry.price != null ? String(entry.price) : '')

  const commit = () => {
    setEditing(false)
    const parsed = draft.trim() === '' ? null : Number(draft.replace(',', '.'))
    const price = parsed != null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null
    if (price !== entry.price) onPatch({ price })
  }

  return (
    <li
      className="relative mb-4 px-3.5 pt-3.5 pb-3 lg:mb-0"
      style={{
        background: 'var(--color-paper-100)',
        color: INK,
        clipPath: TORN,
        boxShadow: 'var(--shadow-poster)',
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0.16,
          backgroundImage: `radial-gradient(rgba(26,23,18,.9) 1px, transparent 1.2px)`,
          backgroundSize: '4px 4px',
        }}
      />

      <div className="relative">
        <div className="relative border-b-2 pb-1" style={{ borderColor: INK }}>
          <p className="t-display text-center text-[13px] tracking-[.12em] uppercase">Wanted</p>
          <button
            onClick={onRemove}
            aria-label={`Retirer ${entry.card?.name ?? entry.card_id}`}
            className="absolute -top-1 right-0 flex size-[var(--touch)] items-center justify-center text-lg"
            style={{ color: 'rgba(34,28,18,.55)' }}
          >
            ×
          </button>
        </div>

        <div className="flex gap-3.5 pt-3 lg:flex-col lg:gap-3">
          <Link
            to={`/card/${encodeURIComponent(entry.card_id)}?language=${entry.language}`}
            className="relative shrink-0 lg:w-full"
          >
            {src ? (
              <img
                src={src}
                alt=""
                decoding="async"
                className="h-[224px] w-[160px] object-cover lg:h-auto lg:w-full lg:aspect-[600/838]"
                style={{ boxShadow: `0 0 0 2px ${INK}` }}
              />
            ) : (
              <div
                className="h-[224px] w-[160px] lg:h-auto lg:w-full lg:aspect-[600/838]"
                style={{ background: 'rgba(34,28,18,.1)', boxShadow: `0 0 0 2px ${INK}` }}
              />
            )}
            {/* Anchored to the image itself rather than to the card's overall height --
                the stacked desktop layout below makes the card far taller than the
                horizontal mobile one, and a stamp positioned by distance from the
                card's bottom would drift off the artwork entirely once that height
                changes. */}
            <span
              aria-hidden
              className="pointer-events-none absolute top-3 -right-1.5 px-2 py-1 font-mono text-[10px] tracking-[.14em] uppercase"
              style={{
                background: 'var(--color-paper-100)',
                border: `2px solid var(--color-ember-500)`,
                color: 'var(--color-ember-500)',
                transform: 'rotate(-11deg)',
                opacity: 0.9,
              }}
            >
              {PRIORITY_LABELS[entry.priority]}
            </span>
          </Link>

          <div className="min-w-0 flex-1">
            {/* The full label, variant included: two printings of one card share
                their artwork exactly, and a poster that does not say which is which
                sends you hunting for the wrong one. */}
            <p className="t-display truncate text-[1.35rem] lg:text-[1.6rem]">
              {entry.card?.name ?? entry.card_id}
            </p>
            <p
              className="flex items-center gap-1.5 pt-1 font-mono text-[11px] tracking-[.1em] uppercase"
              style={{ color: 'rgba(34,28,18,.6)' }}
            >
              {printingLabel('', entry.card_id).trim()} ·{' '}
              <Edition language={entry.language} />
            </p>

            {/* The bounty. It is the price you would actually pay, typed in by hand —
                there is no price feed behind this app, and a plausible-looking
                number nobody entered would read as real data. Empty is honest, and
                it is a button so it can stop being empty. */}
            <div className="pt-3">
              {editing ? (
                <input
                  autoFocus
                  inputMode="decimal"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={commit}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commit()
                    if (event.key === 'Escape') setEditing(false)
                  }}
                  aria-label="Prix constaté, en euros"
                  className="t-display w-full bg-transparent text-[1.6rem] outline-none lg:text-[1.9rem]"
                  style={{ borderBottom: `2px solid ${INK}`, color: INK }}
                />
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="t-display flex min-h-[var(--touch)] items-baseline gap-1 text-[1.6rem] lg:text-[1.9rem]"
                  style={{ color: entry.price == null ? 'rgba(34,28,18,.38)' : INK }}
                >
                  {entry.price == null ? (
                    <span className="text-[1rem] font-medium underline underline-offset-4">
                      Noter le prix
                    </span>
                  ) : (
                    <>
                      {entry.price.toLocaleString('fr', {
                        minimumFractionDigits: Number.isInteger(entry.price) ? 0 : 2,
                        maximumFractionDigits: 2,
                      })}
                      <span className="text-[1rem]">€</span>
                    </>
                  )}
                </button>
              )}
              <p
                className="pt-0.5 text-center font-mono text-[9px] tracking-[.14em] uppercase"
                style={{ color: 'rgba(34,28,18,.55)' }}
              >
                Dead or alive
              </p>
            </div>
          </div>
        </div>

        <PriorityStars priority={entry.priority} onChange={(priority) => onPatch({ priority })} />
      </div>
    </li>
  )
}

/* Three stars, most urgent on the right -- the same gesture as any star rating:
   hovering previews how many would be filled, the click is what actually commits it.
   Priority runs the other way (1 is the most wanted), so the star position and the
   priority level are deliberately inverted here rather than the reverse of the
   PRIORITY_LABELS dict, chosen with the user rather than assumed either way. */
function PriorityStars({
  priority,
  onChange,
}: {
  priority: number
  onChange: (priority: number) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const filled = hover ?? 4 - priority

  return (
    <div className="mt-3.5 flex gap-1.5" onMouseLeave={() => setHover(null)}>
      {[1, 2, 3].map((position) => {
        const level = 4 - position
        return (
          <button
            key={position}
            type="button"
            onMouseEnter={() => setHover(position)}
            onFocus={() => setHover(position)}
            onBlur={() => setHover(null)}
            onClick={() => onChange(level)}
            aria-pressed={priority === level}
            aria-label={`${position} étoile${position > 1 ? 's' : ''} — ${PRIORITY_LABELS[level]}`}
            className="grid min-h-[var(--touch)] flex-1 place-items-center"
          >
            <Star filled={filled >= position} />
          </button>
        )
      })}
    </div>
  )
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="22" height="22" aria-hidden>
      <path
        d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.539-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
        fill={filled ? INK : 'none'}
        stroke={INK}
        strokeWidth={filled ? 0 : 1.3}
        strokeLinejoin="round"
        opacity={filled ? 1 : 0.4}
      />
    </svg>
  )
}
