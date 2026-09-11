import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError, api, imageUrl } from '../lib/api'
import { Sky } from '../components/Sky'
import { Button, Chip, Segmented, Sheet, Spinner } from '../components/ui'
import { RARITY_RANK } from './Collection'
import type {
  Language,
  SharedCollection as SharedCollectionData,
  SharedCollectionEntry,
} from '../lib/types'

type View = 'all' | 'doubles'

/* Single-select, unlike the owner's own combinable sort chain on Collection.tsx --
   that chain earns its complexity for someone curating their own binder daily; a
   visitor skimming someone else's for a trade is choosing one axis at a time, and a
   chain here would be power nobody asked for. */
type Sort = 'date_desc' | 'date_asc' | 'set_asc' | 'set_desc'
  | 'value_desc' | 'value_asc' | 'rarity_desc' | 'rarity_asc' | 'doublon_desc'

const SORT_LABEL: Record<Sort, string> = {
  date_desc: "Date d'ajout +", date_asc: "Date d'ajout -",
  set_asc: 'Extension croissante', set_desc: 'Extension décroissante',
  value_desc: 'Valeur décroissante', value_asc: 'Valeur croissante',
  rarity_desc: 'Plus rare', rarity_asc: 'Moins rare',
  doublon_desc: "Doublons d'abord",
}

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
  const [view, setView] = useState<View>('all')
  const [language, setLanguage] = useState<Language | null>(null)
  const [packFilter, setPackFilter] = useState<string[]>([])
  const [sort, setSort] = useState<Sort>('date_desc')
  const [filtersOpen, setFiltersOpen] = useState(false)

  useEffect(() => {
    api
      .sharedCollection(token)
      .then(setData)
      .catch((error) => setNotFound(error instanceof ApiError && error.status === 404))
  }, [token])

  const entries = data?.entries ?? []

  // From the whole binder, never the already-narrowed list -- picking an extension
  // or an edition must never make another still-valid option vanish from this list,
  // the same rule Collection.tsx's own version of this follows.
  const availableExtensions = useMemo(() => {
    const byCode = new Map<string, string>()
    for (const entry of entries) {
      const code = entry.card?.pack_code
      if (!code || byCode.has(code)) continue
      byCode.set(code, entry.card?.pack_name || code)
    }
    return [...byCode].sort(([a], [b]) => a.localeCompare(b))
  }, [entries])

  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (!language || entry.language === language)
          && (packFilter.length === 0
            || (entry.card?.pack_code != null && packFilter.includes(entry.card.pack_code))),
      ),
    [entries, language, packFilter],
  )

  // Doubles only, the same threshold the owner's own Collection screen uses for its
  // "Doubles" tab -- a stranger looking for a trade cares about what is spare, not
  // about seeing the whole binder a second time filtered down to nothing useful.
  const doubles = useMemo(
    () => filteredEntries.filter((entry) => entry.quantity > 1),
    [filteredEntries],
  )

  const shown = useMemo(() => {
    const base = view === 'doubles' ? doubles : filteredEntries
    return [...base].sort(compare(sort))
  }, [view, doubles, filteredEntries, sort])

  const togglePackFilter = (code: string) => {
    setPackFilter((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code])
  }

  const applied = [
    language === 'en' ? 'INT' : language === 'jp' ? 'JP' : null,
    ...packFilter,
    sort === 'date_desc' ? null : SORT_LABEL[sort],
  ].filter(Boolean) as string[]

  const resetFilters = () => {
    setLanguage(null)
    setPackFilter([])
    setSort('date_desc')
  }

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
                <>
                  <div className="flex items-center gap-2 pt-5">
                    <Segmented
                      value={view}
                      options={[
                        { value: 'all', label: 'Tout' },
                        { value: 'doubles', label: 'Doubles', badge: doubles.length || undefined },
                      ]}
                      onChange={setView}
                      label="Filtrer"
                    />
                    <button
                      onClick={() => setFiltersOpen(true)}
                      aria-haspopup="dialog"
                      aria-label={applied.length ? `Filtres actifs : ${applied.join(', ')}` : 'Filtres'}
                      className="flex size-11 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: applied.length ? 'var(--gradient-sun)' : 'var(--surface-recessed)',
                        color: applied.length ? 'var(--color-paper-ink)' : 'var(--text-secondary)',
                      }}
                    >
                      <FilterIcon className="size-[18px]" />
                    </button>
                  </div>

                  {applied.length > 0 && (
                    <div className="flex items-center gap-2 pt-2">
                      <p className="t-code min-w-0 flex-1 truncate">{applied.join(' · ')}</p>
                      <button onClick={resetFilters} className="t-code min-h-[var(--touch)] shrink-0 px-2">
                        Tout effacer
                      </button>
                    </div>
                  )}

                  {shown.length === 0 ? (
                    <p className="pt-8 text-sm text-[var(--text-secondary)]">
                      {view === 'doubles'
                        ? "Aucun double pour l'instant."
                        : 'Aucune carte pour ces filtres.'}
                    </p>
                  ) : (
                    <ul className="mt-6 grid grid-cols-3 gap-1.5 lg:grid-cols-6">
                      {shown.map((entry) => (
                        <Tile key={`${entry.card_id}-${entry.language}`} entry={entry} />
                      ))}
                    </ul>
                  )}

                  <Sheet
                    open={filtersOpen}
                    onClose={() => setFiltersOpen(false)}
                    title="Filtres"
                    footer={
                      <div className="flex gap-2">
                        <div className="shrink-0">
                          <Button variant="quiet" onClick={resetFilters} disabled={!applied.length}>
                            Tout effacer
                          </Button>
                        </div>
                        <Button full onClick={() => setFiltersOpen(false)}>
                          Voir {shown.length.toLocaleString('fr')} carte{shown.length > 1 ? 's' : ''}
                        </Button>
                      </div>
                    }
                  >
                    <Group label="Édition">
                      <Segmented
                        value={language ?? 'all'}
                        options={[
                          { value: 'all' as const, label: 'Les deux' },
                          { value: 'en' as const, label: 'International' },
                          { value: 'jp' as const, label: 'Japonais' },
                        ]}
                        onChange={(next) => setLanguage(next === 'all' ? null : (next as Language))}
                        label="Édition"
                      />
                    </Group>

                    {availableExtensions.length > 0 && (
                      <Group label="Extension">
                        {sortChip('set_asc', 'Extension croissante')}
                        {sortChip('set_desc', 'Extension décroissante')}
                        {availableExtensions.map(([code, name]) => (
                          <Chip
                            key={code}
                            active={packFilter.includes(code)}
                            onClick={() => togglePackFilter(code)}
                            title={name}
                          >
                            {code}
                          </Chip>
                        ))}
                      </Group>
                    )}

                    <Group label="Valeur">
                      {sortChip('value_desc', 'Valeur décroissante')}
                      {sortChip('value_asc', 'Valeur croissante')}
                    </Group>

                    <Group label="Rareté">
                      {sortChip('rarity_desc', 'Plus rare')}
                      {sortChip('rarity_asc', 'Moins rare')}
                    </Group>

                    <Group label="Doublons">
                      {sortChip('doublon_desc', "Doublons d'abord")}
                    </Group>
                  </Sheet>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )

  function sortChip(value: Sort, label: string) {
    return (
      <Chip active={sort === value} onClick={() => setSort(value)}>
        {label}
      </Chip>
    )
  }
}

/* Absence sinks to the bottom whichever direction is chosen -- a card with no
   price/rarity/extension known is not "worth zero", it is unknown, and the two
   must never look the same on a sorted list. */
function compare(sort: Sort) {
  return (a: SharedCollectionEntry, b: SharedCollectionEntry): number => {
    switch (sort) {
      case 'date_asc':
        return a.date_added.localeCompare(b.date_added)
      case 'date_desc':
        return b.date_added.localeCompare(a.date_added)
      case 'set_asc':
      case 'set_desc': {
        const pa = a.card?.pack_code
        const pb = b.card?.pack_code
        if (pa == null) return pb == null ? 0 : 1
        if (pb == null) return -1
        return pa.localeCompare(pb) * (sort === 'set_asc' ? 1 : -1)
      }
      case 'value_desc':
      case 'value_asc': {
        const va = pileValue(a)
        const vb = pileValue(b)
        if (va == null) return vb == null ? 0 : 1
        if (vb == null) return -1
        return sort === 'value_asc' ? va - vb : vb - va
      }
      case 'rarity_desc':
      case 'rarity_asc': {
        const ra = rarityRank(a)
        const rb = rarityRank(b)
        if (ra == null) return rb == null ? 0 : 1
        if (rb == null) return -1
        return sort === 'rarity_asc' ? ra - rb : rb - ra
      }
      case 'doublon_desc':
        return b.quantity - a.quantity
    }
  }
}

function pileValue(entry: SharedCollectionEntry): number | null {
  const price = entry.card?.market_price
  return price == null ? null : entry.quantity * price
}

function rarityRank(entry: SharedCollectionEntry): number | null {
  const rarity = entry.card?.rarity
  return rarity != null && rarity in RARITY_RANK ? RARITY_RANK[rarity] : null
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

/* Wrapped rather than scrolled sideways -- same reasoning as Collection.tsx's own
   Group: in a sheet there is room to show every option at once. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="pt-5 first:pt-2">
      <h3 className="t-eyebrow pb-2.5">{label}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  )
}

function FilterIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path
        d="M3 5h14M6 10h8M8.5 15h3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}
