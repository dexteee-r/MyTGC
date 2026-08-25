import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Edition } from '../components/Edition'
import { GroupPicker } from '../components/GroupPicker'
import { ChevronLeftIcon, FolderIcon, InfoIcon, LinkIcon } from '../components/icons'
import { PriceChart } from '../components/PriceChart'
import { ShareDialog } from '../components/ShareDialog'
import {
  Button,
  Chip,
  Dialog,
  EmptyState,
  PageHeader,
  Screen,
  Segmented,
  Sheet,
  Sounding,
} from '../components/ui'
import { api, imageUrl } from '../lib/api'
import { useCollection } from '../lib/collection'
import { money } from '../lib/money'
import { useToast } from '../lib/toast'
import type { CollectionEntry, CollectionGroup, Language, ValuePoint } from '../lib/types'

/* Every sort dimension is now independent rather than one mutually-exclusive value:
   asked specifically so several could combine into a spreadsheet-style multi-column
   sort -- extension first, value second to break the ties within it, say. `doublon`
   has no opposite direction (there is only "highest pile first"), so its own
   direction field is never read; it exists only so the chain and the toggle
   function share one shape instead of a special case for one entry. */
type SortKey = 'date' | 'set' | 'price' | 'rarity' | 'doublon'
type Direction = 'asc' | 'desc'
interface SortCriterion {
  key: SortKey
  direction: Direction
}

// Newest first, alone -- the same default this page has always opened on, from
// before "Récentes" even had two directions of its own.
const DEFAULT_SORT: SortCriterion[] = [{ key: 'date', direction: 'desc' }]

function isDefaultSort(chain: SortCriterion[]): boolean {
  return chain.length === 1 && chain[0].key === 'date' && chain[0].direction === 'desc'
}

const SORT_LABEL: Record<SortKey, Record<Direction, string>> = {
  date: { desc: "Date d'ajout +", asc: "Date d'ajout -" },
  set: { asc: 'Extension croissante', desc: 'Extension décroissante' },
  price: { desc: 'Valeur décroissante', asc: 'Valeur croissante' },
  rarity: { desc: 'Plus rare', asc: 'Moins rare' },
  doublon: { desc: "Doublons d'abord", asc: "Doublons d'abord" },
}

type View = 'all' | 'doubles' | 'group'

/* The pile, not the card: quantity × market_price, the same total "Doubles" already
   uses to tell possédées from échangeables. A unit price would rank a lone 40 €
   card above a stack of three 15 € ones, which is not what "worth the most" means
   here. Unpriced sinks to the bottom either direction -- absence is not a low
   price. */
function pileValue(entry: CollectionEntry): number | null {
  const price = entry.card?.market_price
  return price == null ? null : entry.quantity * price
}

/* The game's own ladder (Common < Uncommon < Rare < SuperRare < SecretRare), decided
   over the app's own filter-chip order when the two disagreed. Leader, Promo, Special
   and TreasureRare sit outside that ladder entirely -- every deck holds exactly one
   Leader, and Promo spans free giveaways to tournament prizes -- so they are placed
   after SecretRare as the rarest tier rather than folded into the five-step scale,
   Treasure Rare last as the game's actual chase rarity. */
const RARITY_RANK: Record<string, number> = {
  Common: 0, Uncommon: 1, Rare: 2, SuperRare: 3, SecretRare: 4,
  Leader: 5, Promo: 6, Special: 7, TreasureRare: 8,
}

function rarityRank(entry: CollectionEntry): number | null {
  const rarity = entry.card?.rarity
  return rarity != null && rarity in RARITY_RANK ? RARITY_RANK[rarity] : null
}

/* The printed number, not the id string as a whole -- "OP01-010" has to land after
   "OP01-009", which a plain string compare would get wrong the moment a set passes
   nine cards. Variant suffixes (_p1, _r2) share their base card's number on purpose,
   the same printing rather than a different slot in the set. */
function cardNumber(entry: CollectionEntry): number {
  const match = entry.card_id.match(/-(\d+)/)
  return match ? parseInt(match[1], 10) : Number.POSITIVE_INFINITY
}

/* Spelled out, the same format the card sheet already uses for "Ajoutée le" --
   one date format for the same fact everywhere it appears, not a second one
   invented for this row header. */
function formatDateHeader(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/* One criterion's own comparison, absence-last where absence is possible -- date
   never is, every entry carries the day it landed in the binder. Chained by the
   caller: the chain tries each criterion in priority order and stops at the first
   one that actually tells the two apart, the way a multi-column spreadsheet sort
   works. */
function compareCriterion(c: SortCriterion, a: CollectionEntry, b: CollectionEntry): number {
  switch (c.key) {
    case 'date':
      return c.direction === 'asc'
        ? a.date_added.localeCompare(b.date_added)
        : b.date_added.localeCompare(a.date_added)
    case 'set': {
      const pa = a.card?.pack_code
      const pb = b.card?.pack_code
      if (pa == null) return pb == null ? 0 : 1
      if (pb == null) return -1
      // The printed number is deliberately not compared here -- it is the
      // chain's final, implicit tiebreak (see groups below), not part of this
      // criterion itself, so an explicit second criterion in a combo still gets
      // a turn at breaking the tie before the card number ever does.
      return pa.localeCompare(pb) * (c.direction === 'asc' ? 1 : -1)
    }
    case 'price': {
      const va = pileValue(a)
      const vb = pileValue(b)
      if (va == null) return vb == null ? 0 : 1
      if (vb == null) return -1
      return c.direction === 'asc' ? va - vb : vb - va
    }
    case 'rarity': {
      const ra = rarityRank(a)
      const rb = rarityRank(b)
      if (ra == null) return rb == null ? 0 : 1
      if (rb == null) return -1
      return c.direction === 'asc' ? ra - rb : rb - ra
    }
    case 'doublon':
      return b.quantity - a.quantity
  }
}

/* ── The plate ──────────────────────────────────────────────────────────────
   The collection as an object rather than as an inventory. A list row gives one card
   145px of screen to say a name and a number you already know; three across gives
   the same screen eight cards you can recognise, which is what looking at a
   collection is for.

   Whole cards, watermark included. The SAMPLE across the middle is a property of the
   material, not a defect to crop out, and it is the full portrait silhouette that
   makes a plate read as a page rather than as a row of tiles.                       */

/* Where you were a moment ago, not something to remember about you — so a module
   variable, the way Chercher keeps its query and Extensions keeps its family and
   order. It dies with the tab, and anything worth persisting properly lives on
   the account instead.

   Opening a card unmounts this screen, and coming back from it with "Retour" is
   the whole point of the filters: narrow the collection, open a card, come back
   to the same narrowed list. Without this the filters silently reset on every
   return trip, which is to say exactly when they were being used. */
let left: {
  view: View
  language: Language | null
  sortChain: SortCriterion[]
  // Which group is open, while view is 'group' -- null means the group list
  // itself, not a specific one. Kept here for the same reason the rest of this
  // object is: opening a card from inside a group and hitting "Retour" should
  // land back in that same group, not at the top of the group list.
  activeGroupId: number | null
  // Empty means no restriction, the same convention `language: null` already
  // uses. Codes, not names: OP-01 covers both editions' own printing of it at
  // once, since the two share the same set code -- a card's edition is a
  // separate question the Édition filter already answers on its own.
  packFilter: string[]
} = {
  view: 'all',
  language: null,
  sortChain: DEFAULT_SORT,
  activeGroupId: null,
  packFilter: [],
}

/* Test-only: a fresh `render()` in Vitest still shares this module's `left` with
   every earlier test in the same file, unlike a real reload -- without resetting
   it between tests, whichever filters the previous test left active would leak
   into the next one's starting state. */
export function resetCollectionMemory() {
  left = { view: 'all', language: null, sortChain: DEFAULT_SORT, activeGroupId: null, packFilter: [] }
}

export function Collection() {
  const { entries, stats, ready } = useCollection()
  const { show } = useToast()
  const [sortChain, setSortChainState] = useState<SortCriterion[]>(left.sortChain)
  const [view, setViewState] = useState<View>(left.view)
  const [language, setLanguageState] = useState<Language | null>(left.language)
  const [packFilter, setPackFilterState] = useState<string[]>(left.packFilter)
  const [infoOpen, setInfoOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [valueHistory, setValueHistory] = useState<ValuePoint[]>([])

  const [activeGroupId, setActiveGroupIdState] = useState<number | null>(left.activeGroupId)
  const [myGroups, setMyGroups] = useState<CollectionGroup[] | null>(null)
  const [groupEntries, setGroupEntries] = useState<CollectionEntry[] | null>(null)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [renamingGroup, setRenamingGroup] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false)
  // Multi-select: works from any view, not just a group's own -- picking cards
  // out of "Tout" to file into a group is the common case, not a special one.
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [groupPickerOpen, setGroupPickerOpen] = useState(false)

  /* Written on the way through rather than in an effect: StrictMode mounts
     effects twice in dev, and this only ever needs to record a choice as it is
     made. */
  const setView = (next: View) => {
    left.view = next
    setViewState(next)
  }
  const setLanguage = (next: Language | null) => {
    left.language = next
    setLanguageState(next)
  }
  const setPackFilter = (next: string[]) => {
    left.packFilter = next
    setPackFilterState(next)
  }
  const togglePackFilter = (code: string) => {
    setPackFilter(packFilter.includes(code) ? packFilter.filter((c) => c !== code) : [...packFilter, code])
  }
  const setActiveGroupId = (next: number | null) => {
    left.activeGroupId = next
    setActiveGroupIdState(next)
  }
  const setSortChain = (
    update: SortCriterion[] | ((chain: SortCriterion[]) => SortCriterion[]),
  ) => {
    setSortChainState((chain) => {
      const next = typeof update === 'function' ? update(chain) : update
      left.sortChain = next
      return next
    })
  }

  /* Clicking a chip that isn't in the chain yet appends it -- lowest priority,
     joining an existing combo rather than displacing it. Clicking the SAME
     direction again removes it: the chip is a toggle, not a one-way switch.
     Clicking its opposite direction flips it in place, keeping its priority slot
     -- changing your mind about a criterion's direction is not the same as
     re-ranking it to the back of the queue. */
  const toggleSort = (key: SortKey, direction: Direction) => {
    setSortChain((chain) => {
      // The untouched default is a placeholder, not a first choice someone made
      // -- the first chip anyone actually clicks should become the sole,
      // solo-grouped criterion in its own right, not a second entry tacked onto
      // "newest first" nobody asked to keep. Once a real choice exists, further
      // clicks genuinely extend the chain instead.
      const base = isDefaultSort(chain) ? [] : chain
      const idx = base.findIndex((c) => c.key === key)
      if (idx === -1) return [...base, { key, direction }]
      if (base[idx].direction === direction) {
        // Turning off the last remaining criterion would leave the list with no
        // order at all, which is never a state this page should reach on its
        // own -- it falls back to the same baseline "Tout effacer" resets to,
        // rather than an unsorted list nobody asked for.
        const next = base.filter((c) => c.key !== key)
        return next.length === 0 ? DEFAULT_SORT : next
      }
      return base.map((c, i) => (i === idx ? { key, direction } : c))
    })
  }
  const priorityOf = (key: SortKey, direction: Direction): number | null => {
    const idx = sortChain.findIndex((c) => c.key === key && c.direction === direction)
    return idx === -1 ? null : idx + 1
  }

  const activeGroup = myGroups?.find((g) => g.id === activeGroupId) ?? null

  // What is on, in words, for the trigger that opens the sheet -- same reasoning as
  // appliedLabels in Filters.tsx: a filter you cannot see from the closed button is
  // one you forget you set.
  const applied = [
    language === 'en' ? 'INT' : language === 'jp' ? 'JP' : null,
    view === 'doubles' ? 'Doubles' : null,
    view === 'group' ? (activeGroup ? activeGroup.name : 'Groupes') : null,
    // Spelled out for one, counted for several -- the same choice already made
    // for how many "sur Y cotées" reads versus a bare percentage.
    packFilter.length === 1 ? packFilter[0] : packFilter.length > 1 ? `${packFilter.length} extensions` : null,
    // The lone default (newest first) reads as nothing chosen, same as before this
    // sort had two directions of its own -- everything else, including that same
    // criterion once it joins a combo, is a choice worth surfacing.
    ...(isDefaultSort(sortChain) ? [] : sortChain.map((c) => SORT_LABEL[c.key][c.direction])),
  ].filter(Boolean) as string[]
  const resetFilters = () => {
    setView('all')
    setSortChain(DEFAULT_SORT)
    setLanguage(null)
    setActiveGroupId(null)
    setPackFilter([])
  }

  /* A direct door to Groupes, next to Filtres rather than behind it -- Vue still
     offers it too (nothing here removes that path), but the sheet made it feel
     like a filter to configure rather than a place to go. A second tap steps back
     one level at a time: out of a specific group first, then out of Groupes
     entirely, the same as the chevron inside the group view itself. */
  const toggleGroupsShortcut = () => {
    if (view !== 'group') setView('group')
    else if (activeGroupId != null) setActiveGroupId(null)
    else setView('all')
  }

  // Its own request rather than folded into useCollection: every other screen that
  // context feeds has no use for a time series, and a failure here should leave the
  // rest of the page alone rather than blank the whole collection over a chart.
  useEffect(() => {
    api.collectionValueHistory().then(setValueHistory).catch(() => {})
  }, [])

  const refreshGroups = () => api.groups().then(setMyGroups).catch(() => {})

  useEffect(() => {
    if (view === 'group') refreshGroups()
  }, [view])

  useEffect(() => {
    if (view !== 'group' || activeGroupId == null) return
    setGroupEntries(null)
    api.groupCards(activeGroupId).then(setGroupEntries).catch(() => setGroupEntries([]))
  }, [view, activeGroupId])

  const createGroup = async () => {
    const trimmed = newGroupName.trim()
    if (!trimmed) return
    const group = await api.createGroup(trimmed).catch(() => null)
    if (group) {
      setNewGroupName('')
      setCreatingGroup(false)
      refreshGroups()
    }
  }

  const renameActiveGroup = async () => {
    if (activeGroupId == null) return
    const trimmed = renameValue.trim()
    if (!trimmed) return
    await api.renameGroup(activeGroupId, trimmed).catch(() => {})
    setRenamingGroup(false)
    refreshGroups()
  }

  const deleteActiveGroup = async () => {
    if (activeGroupId == null) return
    await api.deleteGroup(activeGroupId).catch(() => {})
    setConfirmDeleteGroup(false)
    setActiveGroupId(null)
    refreshGroups()
  }

  const removeFromActiveGroup = async (entryId: number) => {
    if (activeGroupId == null) return
    // Optimistic: waiting on the round trip here would leave a card that was just
    // dismissed sitting on screen for another beat, undoing the very thing the tap
    // was for.
    setGroupEntries((current) => current?.filter((e) => e.id !== entryId) ?? null)
    await api.removeFromGroup(activeGroupId, entryId).catch(() => {})
    refreshGroups()
  }

  const toggleSelect = (id: number) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exitSelecting = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  const bulkAddToGroup = async (groupId: number) => {
    const count = selected.size
    await api.addToGroup(groupId, [...selected]).catch(() => {})
    setGroupPickerOpen(false)
    exitSelecting()
    show(`${count} carte${count > 1 ? 's' : ''} ajoutée${count > 1 ? 's' : ''} au groupe`)
    if (view === 'group') refreshGroups()
  }

  // Account-wide, never scoped to the current Édition or Extension choice: the
  // list of what to offer has to survive narrowing the very thing it offers to
  // narrow, the same reasoning `stats` and the header meta already follow.
  // Grouped by code alone -- OP-01 stays one entry even if both editions are
  // held, matching the filter itself. Packless cards (Promos with no printed
  // set) have nothing to group under and are left out of the list entirely
  // rather than folded into a catch-all "Sans extension" a person could select
  // and expect to mean something specific.
  const availableExtensions = useMemo(() => {
    const byCode = new Map<string, string>()
    for (const entry of entries) {
      const code = entry.card?.pack_code
      if (!code || byCode.has(code)) continue
      byCode.set(code, entry.card?.pack_name || code)
    }
    return [...byCode].sort(([a], [b]) => a.localeCompare(b))
  }, [entries])

  // Applied before Vue and before Trier: which language and which extensions are
  // on the table decide what there is to view or sort in the first place. The
  // header meta and the "Valeur estimée" total under Tout stay account-wide
  // regardless -- the same choice already made for the Doubles view, which
  // doesn't rescale them either.
  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (!language || entry.language === language) &&
          (packFilter.length === 0 || (entry.card?.pack_code != null && packFilter.includes(entry.card.pack_code))),
      ),
    [entries, language, packFilter],
  )

  /* What is worth trading: every card held more than once. The card you'd keep is
     never in this count — a stack of three shows two, because the base of a trade
     is what you can give away without emptying your own binder. */
  const doubles = useMemo(
    () => filteredEntries.filter((entry) => entry.quantity > 1),
    [filteredEntries],
  )

  /* Both figures the doubles view needs, computed here rather than on the server:
     the collection is already loaded whole for every screen, and this is the only
     place anyone asks for it — a stats endpoint for one number one screen reads
     would be a round trip to save a filter and a reduce. */
  const doublesValue = useMemo(() => {
    let held = 0
    let trade = 0
    let priced = 0
    for (const entry of doubles) {
      const price = entry.card?.market_price
      if (price == null) continue
      priced += 1
      held += entry.quantity * price
      trade += (entry.quantity - 1) * price
    }
    return { held, trade, priced }
  }, [doubles])

  const source = view === 'doubles' ? doubles : filteredEntries

  const groups = useMemo(() => {
    // The printed number is the chain's standing, implicit last word -- it is
    // what "Extension croissante" alone has always meant (extension, then the
    // number within it), and a harmless, stable tiebreak the rest of the time
    // rather than leaving ties to whatever order the collection happened to load
    // in. Direction follows Extension's own when it is part of the chain.
    const numberDir = sortChain.find((c) => c.key === 'set')?.direction === 'desc' ? -1 : 1
    const sorted = [...source].sort((a, b) => {
      for (const criterion of sortChain) {
        const cmp = compareCriterion(criterion, a, b)
        if (cmp !== 0) return cmp
      }
      return (cardNumber(a) - cardNumber(b)) * numberDir
    })

    // Row headers only make sense when extension or date is the WHOLE story --
    // a section per extension with a second criterion silently reordering cards
    // inside it would look like the section itself was sorted wrong. The moment
    // a second criterion joins the chain, the sections step aside and the combo
    // still applies, just as a flat list.
    const solo = sortChain.length === 1 ? sortChain[0] : null
    if (solo?.key !== 'set' && solo?.key !== 'date') return [{ key: '', items: sorted }]

    const buckets = new Map<string, typeof sorted>()
    for (const entry of sorted) {
      const key =
        solo.key === 'date' ? formatDateHeader(entry.date_added) : (entry.card?.pack_code ?? 'Sans extension')
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key)!.push(entry)
    }
    return [...buckets].map(([key, items]) => ({ key, items }))
  }, [source, sortChain])

  // The rank badge only earns its place once there is a chain to rank -- a lone
  // active chip needs no "1" next to it, the same reasoning as isDefaultSort
  // above keeping a single default criterion out of `applied`.
  const sortChip = (key: SortKey, direction: Direction, label: string) => {
    const priority = priorityOf(key, direction)
    return (
      <Chip active={priority != null} onClick={() => toggleSort(key, direction)}>
        {label}
        {priority != null && sortChain.length > 1 && (
          <span className="t-numeral text-[0.7rem] opacity-70">{priority}</span>
        )}
      </Chip>
    )
  }

  if (!ready) return <div className="pt-10"><Sounding label="Ouverture du journal" /></div>

  return (
    <Screen className="scrollbar-desktop">
      <PageHeader
        title="Collection"
        meta={
          stats
            ? `${stats.total_quantity} cartes · ${stats.distinct_cards} références`
            : undefined
        }
        action={
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setShareOpen(true)}
              aria-label="Partager ma collection"
              className="flex size-11 items-center justify-center rounded-full text-[var(--text-secondary)]"
            >
              <LinkIcon className="size-5" />
            </button>
            <button
              onClick={toggleGroupsShortcut}
              aria-pressed={view === 'group'}
              aria-label={
                view === 'group' ? (activeGroup ? `Groupe : ${activeGroup.name}` : 'Groupes') : 'Groupes'
              }
              className="flex size-11 items-center justify-center rounded-full"
              style={{
                background: view === 'group' ? 'var(--gradient-sun)' : 'transparent',
                color: view === 'group' ? 'var(--color-paper-ink)' : 'var(--text-secondary)',
              }}
            >
              <FolderIcon className="size-5" />
            </button>
            <button
              onClick={() => setFiltersOpen(true)}
              aria-haspopup="dialog"
              aria-label={applied.length ? `Filtres actifs : ${applied.join(', ')}` : 'Filtres'}
              className="flex size-11 items-center justify-center rounded-full"
              style={{
                background: applied.length ? 'var(--gradient-sun)' : 'transparent',
                color: applied.length ? 'var(--color-paper-ink)' : 'var(--text-secondary)',
              }}
            >
              <FilterIcon className="size-[18px]" />
            </button>
            <button
              onClick={() => setInfoOpen(true)}
              aria-label="Comment fonctionne cette page"
              className="flex size-11 items-center justify-center rounded-full text-[var(--text-secondary)]"
            >
              <InfoIcon className="size-5" />
            </button>
          </div>
        }
      />

      {applied.length > 0 && (
        <div className="flex items-center gap-2 px-5 pb-2">
          <p className="t-code min-w-0 flex-1 truncate">{applied.join(' · ')}</p>
          <button onClick={resetFilters} className="t-code min-h-[var(--touch)] shrink-0 px-2">
            Tout effacer
          </button>
        </div>
      )}

      {/* Multi-select works from whichever view is on screen -- picking cards out
          of "Tout" to file into a group is the common case, so this is not tucked
          away inside the Groupes view specifically. */}
      {entries.length > 0 && (
        <div className="flex items-center gap-2 px-5 pb-2">
          {selecting ? (
            <>
              <p className="t-code min-w-0 flex-1 truncate">
                {selected.size} sélectionnée{selected.size > 1 ? 's' : ''}
              </p>
              <Button
                variant="quiet"
                disabled={selected.size === 0}
                onClick={() => setGroupPickerOpen(true)}
              >
                Ajouter à un groupe
              </Button>
              <button onClick={exitSelecting} className="t-code min-h-[var(--touch)] shrink-0 px-2">
                Annuler
              </button>
            </>
          ) : (
            <button
              onClick={() => setSelecting(true)}
              className="t-code min-h-[var(--touch)] shrink-0 px-2 text-[var(--text-secondary)]"
            >
              Sélectionner
            </button>
          )}
        </div>
      )}

      <GroupPicker
        open={groupPickerOpen}
        onClose={() => setGroupPickerOpen(false)}
        onPick={bulkAddToGroup}
      />

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Partager ma collection"
        description="Un lien en lecture seule vers ce que tu possèdes — quantités et état inclus, jamais ce que tu as payé ni tes notes. N'importe qui avec ce lien peut le consulter, sans compte."
        fetchStatus={api.collectionShareStatus}
        enable={api.enableCollectionShare}
        disable={api.disableCollectionShare}
        publicPath={(token) => `/shared/collection/${token}`}
      />

      <Dialog open={infoOpen} onClose={() => setInfoOpen(false)} title="Comment ça marche">
        <div className="space-y-4 text-sm leading-relaxed text-[var(--text-secondary)]">
          <p>
            Chaque carte scannée ou ajoutée depuis sa fiche atterrit ici. Le médaillon{' '}
            <span className="t-numeral text-[0.8rem]" style={{ color: 'var(--text-primary)' }}>×3</span>{' '}
            dans le coin d'une carte n'apparaît que si tu en as plus d'un exemplaire —
            un « 1 » sur chaque carte serait du bruit sur un écran qui montre déjà ce
            que tu possèdes.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Édition</strong> restreint
            la liste à l'international, au japonais, ou aux deux. Le nombre de cartes en
            haut de page et la valeur estimée restent ceux de tout le classeur, quelle
            que soit l'édition choisie ici.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Extension</strong> restreint
            la liste aux extensions choisies — seules celles où tu possèdes au moins une
            carte apparaissent dans la liste. Choisis-en plusieurs pour les voir toutes à
            la fois ; une extension possédée dans les deux éditions les compte ensemble,
            l'édition choisie ci-dessus reste une question séparée.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Tout / Doubles</strong> change
            quelles cartes sont listées. « Doubles » ne garde que celles possédées en
            plusieurs exemplaires, avec deux totaux distincts : <em>possédées</em> compte
            tout ce que tu en as, <em>échangeables</em> ne compte que le surplus — un
            exemplaire de chaque reste toujours dans ton classeur.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Groupes</strong> range tes
            cartes dans des dossiers que tu crées et nommes toi-même — même
            dessinateur, même style d'illustration, ou toute autre raison qui te
            convient. Rien d'automatique : tu ajoutes une carte à un groupe depuis sa
            fiche, ou en sélectionnant plusieurs cartes ici même. Une carte peut
            appartenir à plusieurs groupes à la fois, et la retirer d'un groupe ne la
            retire jamais de ta collection.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Trier</strong> ordonne la
            liste par date d'ajout, par extension puis numéro, par valeur —
            quantité × cote actuelle, pas le prix payé —, ou par rareté, sur
            l'échelle du jeu (Common à SecretRare, puis
            Leader/Promo/Special/TreasureRare comme le palier le plus rare) — dans
            les deux sens à chaque fois, et plusieurs à la fois : le premier choisi
            classe la liste, les suivants ne départagent que ses égalités, dans
            l'ordre où ils ont été activés. Une seule rangée par jour ou par
            extension apparaît quand ce critère est seul actif ; dès qu'un
            deuxième s'y ajoute, la liste redevient une seule rangée, triée selon
            la combinaison entière. « Doublons d'abord » met les piles les plus
            hautes en tête sans rien cacher, à la différence de la vue « Doubles »
            ci-dessus qui retire les exemplaires uniques de la liste. Une carte
            sans extension connue, non cotée, ou sans rareté connue reste
            toujours en fin de liste, quel que soit le sens. Ça ne change jamais
            quelles cartes sont affichées, seulement leur ordre.
          </p>
          <p>
            La <strong style={{ color: 'var(--text-primary)' }}>valeur estimée</strong> vient
            de tcgcsv (le marché américain, converti en euros au taux du jour), pas de
            Cardmarket. Elle ne couvre pas toutes les cartes — la ligne « X sur Y
            cotées » dit ce qui manque plutôt que de laisser un total partiel se lire
            comme une estimation complète.
          </p>
          <p>
            La courbe sous « Tout » retrace cette valeur au fil des relevés. Elle
            compte ce que tu possèdes aujourd'hui à chaque prix passé, seulement à
            partir du jour où tu l'as ajouté — jamais avant. Elle ne sait en revanche
            pas retirer une carte revendue ou une quantité baissée depuis : rien ne
            garde trace de ça.
          </p>
        </div>
      </Dialog>

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
      ) : view === 'group' ? (
        activeGroupId == null ? (
          <div className="px-5 pb-4">
            {myGroups === null ? (
              <Sounding label="Ouverture des groupes" />
            ) : myGroups.length === 0 && !creatingGroup ? (
              <EmptyState
                title="Aucun groupe pour l'instant"
                action={
                  <Button size="lg" onClick={() => setCreatingGroup(true)}>
                    Créer un groupe
                  </Button>
                }
              >
                Un groupe range des cartes selon un critère qui te parle -- même
                dessinateur, même style d'illustration, ou toute autre raison.
              </EmptyState>
            ) : (
              <>
                <ul className="space-y-2">
                  {myGroups.map((group) => (
                    <li key={group.id}>
                      <button
                        onClick={() => setActiveGroupId(group.id)}
                        className="flex min-h-[var(--touch)] w-full items-center justify-between gap-3 rounded-[14px] px-4"
                        style={{ background: 'var(--surface-recessed)' }}
                      >
                        <span className="truncate text-sm font-medium">{group.name}</span>
                        <span className="t-numeral shrink-0 text-sm text-[var(--text-faint)]">
                          {group.card_count}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>

                {creatingGroup ? (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      autoFocus
                      value={newGroupName}
                      onChange={(event) => setNewGroupName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') createGroup()
                      }}
                      placeholder="Nom du groupe"
                      maxLength={60}
                      aria-label="Nom du nouveau groupe"
                      className="t-code min-h-[var(--touch)] w-full min-w-0 rounded-full px-4 outline-none"
                      style={{ background: 'var(--surface-recessed)' }}
                    />
                    <Button variant="quiet" disabled={!newGroupName.trim()} onClick={createGroup}>
                      Créer
                    </Button>
                  </div>
                ) : (
                  <div className="pt-3">
                    <Button variant="quiet" full onClick={() => setCreatingGroup(true)}>
                      + Nouveau groupe
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-5 pb-3">
              <button
                onClick={() => setActiveGroupId(null)}
                aria-label="Retour aux groupes"
                className="flex size-11 shrink-0 items-center justify-center text-[var(--text-secondary)]"
              >
                <ChevronLeftIcon className="size-5" />
              </button>
              {renamingGroup ? (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') renameActiveGroup()
                    }}
                    maxLength={60}
                    aria-label="Renommer le groupe"
                    className="t-code min-h-[var(--touch)] w-full min-w-0 rounded-full px-4 outline-none"
                    style={{ background: 'var(--surface-recessed)' }}
                  />
                  <Button variant="quiet" disabled={!renameValue.trim()} onClick={renameActiveGroup}>
                    OK
                  </Button>
                </div>
              ) : (
                <>
                  <p className="min-w-0 flex-1 truncate text-sm font-medium">{activeGroup?.name}</p>
                  <button
                    onClick={() => {
                      setRenameValue(activeGroup?.name ?? '')
                      setRenamingGroup(true)
                    }}
                    className="t-code shrink-0 px-2 text-[var(--text-secondary)]"
                  >
                    Renommer
                  </button>
                </>
              )}
            </div>

            {confirmDeleteGroup ? (
              <div
                className="mx-5 mb-3 flex items-center gap-2 rounded-[14px] p-3"
                style={{ background: 'var(--surface-recessed)' }}
              >
                <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
                  Supprimer ce groupe ? Les cartes qu'il contient restent dans ta
                  collection.
                </p>
                <Button variant="destructive" onClick={deleteActiveGroup}>
                  Supprimer
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDeleteGroup(false)}>
                  Annuler
                </Button>
              </div>
            ) : (
              <div className="px-5 pb-3">
                <button
                  onClick={() => setConfirmDeleteGroup(true)}
                  className="t-code text-ember-500"
                >
                  Supprimer ce groupe
                </button>
              </div>
            )}

            {groupEntries === null ? (
              <Sounding label="Ouverture du groupe" />
            ) : groupEntries.length === 0 ? (
              <div className="pt-4">
                <EmptyState title="Ce groupe est vide">
                  Ajoute une carte depuis sa fiche, ou sélectionne des cartes ici pour
                  les y ajouter.
                </EmptyState>
              </div>
            ) : (
              <ul className="grid grid-cols-3 content-start gap-1.5 px-4 pb-2 lg:grid-cols-6">
                {groupEntries.map((entry) => (
                  <Seated
                    key={`${entry.card_id}-${entry.language}`}
                    entry={entry}
                    selecting={selecting}
                    selected={selected.has(entry.id)}
                    onToggleSelect={() => toggleSelect(entry.id)}
                    onRemoveFromGroup={() => removeFromActiveGroup(entry.id)}
                  />
                ))}
              </ul>
            )}
          </>
        )
      ) : (
        <>
          {view === 'all' ? (
            /* What the shelf is worth, on the shelf itself. The log book carries the
               same figure beside what it cost and with the full caveat; here it is the
               headline only. The coverage line shows when part of the binder has no
               price — a total presented as if it covered everything is an appraisal,
               and this one never covers the Japanese cards. */
            stats && (
              <div className="flex items-baseline justify-between gap-4 px-5 pb-4">
                <div className="min-w-0">
                  <p className="t-code">Valeur estimée</p>
                  {stats.market_priced > 0 && stats.market_priced < stats.total_quantity && (
                    <p className="t-code pt-1 text-[var(--text-faint)]">
                      {stats.market_priced} sur {stats.total_quantity} cotées
                    </p>
                  )}
                </div>
                {stats.market_priced > 0 ? (
                  <p className="t-numeral shrink-0 text-[1.4rem] leading-none">
                    {money(stats.market_total)}
                  </p>
                ) : (
                  <p className="t-code shrink-0 text-[var(--text-faint)]">aucune carte cotée</p>
                )}
              </div>
            )
          ) : null}

          {/* Only under "Tout": the series is a total across the whole collection,
              so plotting it under "Doubles" would show a number that does not match
              the filtered list underneath it. Scoped to what history has ever priced
              rather than to entries.length, the way PriceChart itself works. */}
          {view === 'all' && valueHistory.length >= 2 && (
            <div className="px-5 pb-4">
              <PriceChart
                points={valueHistory.map((p) => ({ captured_at: p.captured_at, price: p.total }))}
              />
            </div>
          )}

          {view === 'doubles' && (
            doubles.length > 0 && (
              <div className="px-5 pb-4">
                {doublesValue.priced > 0 && doublesValue.priced < doubles.length && (
                  <p className="t-code pb-2 text-[var(--text-faint)]">
                    {doublesValue.priced} sur {doubles.length} cotées
                  </p>
                )}
                {doublesValue.priced > 0 ? (
                  <div className="grid grid-cols-2 gap-4">
                    {/* Both figures rather than one: what the stack is worth and what
                        it is worth to give away are different questions, and picking
                        one to show would answer only one of them. The card you would
                        keep is never in "échangeables" — see doublesValue above. */}
                    <div>
                      <p className="t-numeral text-[1.4rem] leading-none">{money(doublesValue.held)}</p>
                      <p className="t-code pt-1">possédées</p>
                    </div>
                    <div>
                      <p className="t-numeral text-[1.4rem] leading-none">{money(doublesValue.trade)}</p>
                      <p className="t-code pt-1">échangeables</p>
                    </div>
                  </div>
                ) : (
                  <p className="t-code text-[var(--text-faint)]">Aucun double coté pour l'instant.</p>
                )}
              </div>
            )
          )}

          {view === 'doubles' && doubles.length === 0 ? (
            <div className="pt-4">
              <EmptyState title="Aucun double pour l'instant">
                Une carte devient un double dès que tu en as plus d'un exemplaire.
              </EmptyState>
            </div>
          ) : (
            groups.map((group) => (
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
                    <Seated
                      key={`${entry.card_id}-${entry.language}`}
                      entry={entry}
                      selecting={selecting}
                      selected={selected.has(entry.id)}
                      onToggleSelect={() => toggleSelect(entry.id)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
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
              Voir {source.length.toLocaleString('fr')} carte{source.length > 1 ? 's' : ''}
            </Button>
          </div>
        }
      >
        <Group label="Édition">
          <Segmented
            value={language ?? 'all'}
            options={[
              { value: 'all' as const, label: 'Les deux' },
              { value: 'en' as const, label: <Edition language="en" /> },
              { value: 'jp' as const, label: <Edition language="jp" /> },
            ]}
            onChange={(next) => setLanguage(next === 'all' ? null : (next as Language))}
            label="Édition"
          />
        </Group>

        <Group label="Vue">
          <Segmented
            value={view}
            options={[
              { value: 'all' as const, label: 'Tout' },
              { value: 'doubles' as const, label: 'Doubles' },
              { value: 'group' as const, label: 'Groupes' },
            ]}
            onChange={setView}
            label="Vue"
          />
        </Group>

        {/* Each dimension gets its own group instead of one flat row -- separating
            them is what makes combining them legible: which chips belong to the
            same choice (only one of a pair can hold at a time) versus which
            belong to a different one entirely (any number can hold at once).
            The number on an active chip is its rank in the chain, shown only
            once there is more than one to rank. */}
        <Group label="Date d'ajout">
          {sortChip('date', 'desc', "Date d'ajout +")}
          {sortChip('date', 'asc', "Date d'ajout -")}
        </Group>

        <Group label="Extension">
          {sortChip('set', 'asc', 'Extension croissante')}
          {sortChip('set', 'desc', 'Extension décroissante')}
          {/* Chip, not the native <select multiple> this shipped with first:
              reported live on an iPhone, iOS's own picker for a multi-select
              commits and closes on the very first tap, which makes choosing
              several extensions -- the whole point of this filter -- impossible
              on the one platform this app actually runs on day to day. A row of
              toggles has no such platform-specific failure mode, and it is the
              same control every other multi-value filter here already uses. */}
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

        <Group label="Valeur">
          {sortChip('price', 'desc', 'Valeur décroissante')}
          {sortChip('price', 'asc', 'Valeur croissante')}
        </Group>

        <Group label="Rareté">
          {sortChip('rarity', 'desc', 'Plus rare')}
          {sortChip('rarity', 'asc', 'Moins rare')}
        </Group>

        <Group label="Doublons">
          {sortChip('doublon', 'desc', "Doublons d'abord")}
        </Group>
      </Sheet>
    </Screen>
  )
}

/* Wrapped rather than scrolled sideways, the same reasoning as Filters.tsx's own
   Group: in a sheet there is room to show every option at once. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="pt-5 first:pt-2">
      <h3 className="t-eyebrow pb-2.5">{label}</h3>
      {/* items-start, not the flex default (stretch): every other Group only ever
          holds same-height Chips, so this never used to matter -- but the
          Extension select is several rows tall, and stretch was inflating its
          two sibling chips to match its own height instead of leaving them at
          their own natural size. */}
      <div className="flex flex-wrap items-start gap-2">{children}</div>
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

/* One card on the plate. The quantity is only worth saying when it is more than one —
   a "1" on every card is noise on a screen whose whole job is showing what you hold.

   `selecting` swaps the tile from a link (open the card) to a toggle (pick it for
   a bulk action) -- the two gestures would fight over the same tap otherwise.
   `onRemoveFromGroup`, when the card sheet it is not: a quick dismissal from
   *this* group, never from the collection itself, so it only ever appears while
   looking at one specific group's own cards. */
function Seated({
  entry,
  selecting,
  selected,
  onToggleSelect,
  onRemoveFromGroup,
}: {
  entry: CollectionEntry
  selecting?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  onRemoveFromGroup?: () => void
}) {
  const src = entry.card ? imageUrl(entry.card) : null
  const image = src ? (
    <img
      src={src}
      alt=""
      decoding="async"
      className="float aspect-[600/838] w-full object-cover"
    />
  ) : (
    <div className="sunken aspect-[600/838] w-full" />
  )

  if (selecting) {
    return (
      <li className="relative">
        <button
          onClick={onToggleSelect}
          aria-pressed={selected}
          aria-label={`${entry.card?.name ?? entry.card_id}${selected ? ', sélectionnée' : ''}`}
          className="block w-full"
        >
          {image}
          {/* A ring around the chosen ones rather than dimming the rest: the job is
              to pick out which are selected, not to make the others harder to read. */}
          {selected && (
            <>
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-[2px]"
                style={{ boxShadow: 'inset 0 0 0 3px var(--accent-numeral)' }}
              />
              <span
                aria-hidden
                className="t-numeral absolute top-1 right-1 grid size-6 place-items-center rounded-full text-[0.7rem]"
                style={{ background: 'var(--accent-numeral)', color: 'var(--color-paper-ink)' }}
              >
                ✓
              </span>
            </>
          )}
        </button>
      </li>
    )
  }

  return (
    <li className="relative">
      <Link
        to={`/card/${encodeURIComponent(entry.card_id)}?language=${entry.language}`}
        aria-label={`${entry.card?.name ?? entry.card_id}, ${entry.quantity} en collection`}
        className="block"
      >
        {image}
        {entry.quantity > 1 && (
          <span
            className="t-numeral absolute right-0 bottom-0 px-1.5 py-0.5 text-[0.7rem]"
            style={{ background: 'rgba(4,18,26,.86)' }}
          >
            ×{entry.quantity}
          </span>
        )}
      </Link>
      {/* A sibling of the Link, not nested in it -- a button inside an anchor is
          invalid HTML, the same reasoning CardGrid's own wishlist button follows. */}
      {onRemoveFromGroup && (
        <button
          onClick={onRemoveFromGroup}
          aria-label={`Retirer ${entry.card?.name ?? entry.card_id} de ce groupe`}
          className="absolute top-1 right-1 grid size-7 place-items-center rounded-full text-sm"
          style={{ background: 'rgba(4,18,26,.86)', color: 'var(--color-paper-100)' }}
        >
          ×
        </button>
      )}
    </li>
  )
}
