import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Edition, printingLabel } from '../components/Edition'
import {
  EMPTY,
  FilterSheet,
  appliedLabels,
  isFiltered,
  type FilterState,
} from '../components/Filters'
import { LinkIcon } from '../components/icons'
import { ShareDialog } from '../components/ShareDialog'
import { Adrift, Button, EmptyState, PageHeader, Screen, Sounding } from '../components/ui'
import { api, imageUrl } from '../lib/api'
import { useToast } from '../lib/toast'
import type { WishlistEntry } from '../lib/types'

/* ── The hunt ───────────────────────────────────────────────────────────────
   The only screen made of paper in the whole app.

   A card you are hunting IS a wanted poster, so it is drawn as one: cream ground,
   torn edge, halftone screen, a WANTED banner, the bounty struck large, and a red
   stamp across the corner carrying how badly you want it. The break in value with
   every other screen is the point, not an accident — this is the one place the app
   stops being the sea.

   Everything here is drawn in CSS: the torn edge is a clip-path, the halftone is a
   repeating radial gradient. No copyrighted image enters the repository.          */

const PRIORITY: Record<number, string> = {
  1: 'Dès que possible',
  2: 'Si ça se présente',
  3: 'Un jour',
}

/* The torn edge of a poster ripped off a wall. */
const TORN =
  'polygon(0 1%, 4% 0, 12% 1.2%, 26% .2%, 44% 1.4%, 62% .3%, 80% 1.3%, 94% .2%, 100% 1.4%, 100% 98.6%, 92% 100%, 76% 98.8%, 58% 99.8%, 40% 98.6%, 22% 99.8%, 8% 98.8%, 0 99.6%)'

const INK = '#221c12'

export function Wishlist() {
  const { show } = useToast()
  const [entries, setEntries] = useState<WishlistEntry[] | null>(null)
  const [failed, setFailed] = useState(false)
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
    const list = (entries ?? []).filter((entry) => {
      if (filters.language && entry.language !== filters.language) return false
      if (filters.rarities.length && !filters.rarities.includes(entry.card?.rarity ?? ''))
        return false
      if (
        filters.colors.length &&
        !(entry.card?.colors ?? []).some((c) => filters.colors.includes(c))
      )
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
    }[filters.sort]
    return [...list].sort(by)
  }, [entries, filters])

  const load = useCallback(() => {
    setFailed(false)
    api.wishlist().then(setEntries).catch(() => setFailed(true))
  }, [])
  useEffect(load, [load])

  const remove = async (entry: WishlistEntry) => {
    setEntries((current) => (current ?? []).filter((e) => e.id !== entry.id))
    await api.removeFromWishlist(entry.id).catch(load)
    show(`${entry.card?.name ?? entry.card_id} retirée`)
  }

  const patch = async (entry: WishlistEntry, change: Partial<WishlistEntry>) => {
    setEntries((current) =>
      (current ?? []).map((e) => (e.id === entry.id ? { ...e, ...change } : e)),
    )
    await api.updateWishlist(entry.id, change).catch(load)
  }

  const clear = () => setFilters({ ...filters, language: null, ...EMPTY })
  const applied = appliedLabels(filters, null)

  if (failed) return <Screen><div className="pt-10"><Adrift onRetry={load} /></div></Screen>
  if (!entries) return <Screen><div className="pt-10"><Sounding label="Relevé des primes" /></div></Screen>

return (
    <>
      <Screen>
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
          <ul className="px-4 pt-1">
            {shown.map((entry) => (
              <Poster
                key={`${entry.card_id}-${entry.language}`}
                entry={entry}
                onRemove={() => remove(entry)}
                onPatch={(change) => patch(entry, change)}
              />
            ))}
          </ul>
        )}
      </Screen>

      {/* 
        1. Le FilterSheet est sorti du Screen pour éviter les conflits de z-index
        2. La div text-white force le retour au texte clair pour écraser la couleur INK de la page 
      */}
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
      className="relative mb-4 px-3.5 pt-3.5 pb-3"
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
        <div className="flex items-baseline justify-between gap-3 border-b-2 pb-1" style={{ borderColor: INK }}>
          <p className="t-display text-[13px] tracking-[.12em] uppercase">Wanted</p>
          <button
            onClick={onRemove}
            aria-label={`Retirer ${entry.card?.name ?? entry.card_id}`}
            className="-mr-1.5 -mt-1 flex size-[var(--touch)] items-center justify-center text-lg"
            style={{ color: 'rgba(34,28,18,.55)' }}
          >
            ×
          </button>
        </div>

        <div className="flex gap-3.5 pt-3">
          <Link
            to={`/card/${encodeURIComponent(entry.card_id)}?language=${entry.language}`}
            className="shrink-0"
          >
            {src ? (
              <img
                src={src}
                alt=""
                decoding="async"
                className="h-[132px] w-[95px] object-cover"
                style={{ boxShadow: `0 0 0 2px ${INK}` }}
              />
            ) : (
              <div
                className="h-[132px] w-[95px]"
                style={{ background: 'rgba(34,28,18,.1)', boxShadow: `0 0 0 2px ${INK}` }}
              />
            )}
          </Link>

          <div className="min-w-0 flex-1">
            {/* The full label, variant included: two printings of one card share
                their artwork exactly, and a poster that does not say which is which
                sends you hunting for the wrong one. */}
            <p className="t-display truncate text-[1.35rem]">
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
                  className="t-display w-full bg-transparent text-[1.6rem] outline-none"
                  style={{ borderBottom: `2px solid ${INK}`, color: INK }}
                />
              ) : (
                <button
                  onClick={() => setEditing(true)}
                  className="t-display flex min-h-[var(--touch)] items-baseline gap-1 text-[1.6rem]"
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
                className="pt-0.5 font-mono text-[9px] tracking-[.14em] uppercase"
                style={{ color: 'rgba(34,28,18,.55)' }}
              >
                Dead or alive
              </p>
            </div>
          </div>
        </div>

        {/* The stamp: struck across the poster, and it is the priority — so the row
            below is left quiet. Two statements of the same fact twenty pixels apart
            is noise; the loud one is the stamp, the row is only the control. */}
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 bottom-[86px] px-2 py-1 font-mono text-[10px] tracking-[.14em] uppercase"
          style={{
            border: `2px solid var(--color-ember-500)`,
            color: 'var(--color-ember-500)',
            transform: 'rotate(-11deg)',
            opacity: 0.82,
          }}
        >
          {PRIORITY[entry.priority]}
        </span>

        <div className="mt-3.5 flex gap-1.5">
          {[1, 2, 3].map((level) => {
            const active = entry.priority === level
            return (
              <button
                key={level}
                onClick={() => onPatch({ priority: level })}
                aria-pressed={active}
                className="min-h-[var(--touch)] flex-1 px-1 text-[11px] transition"
                style={{
                  color: active ? INK : 'rgba(34,28,18,.5)',
                  boxShadow: active
                    ? `inset 0 -2px 0 var(--color-ember-500)`
                    : 'inset 0 0 0 1px rgba(34,28,18,.18)',
                  fontWeight: active ? 700 : 400,
                }}
              >
                {PRIORITY[level]}
              </button>
            )
          })}
        </div>
      </div>
    </li>
  )
}
