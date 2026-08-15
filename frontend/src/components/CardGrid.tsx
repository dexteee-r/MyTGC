import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { imageUrl } from '../lib/api'
import { useCollection } from '../lib/collection'
import type { Card } from '../lib/types'
import { variantOf } from './Edition'
import { api } from '../lib/api'
import { useToast } from '../lib/toast'
import { EmptyPocket } from './ui'

/* The glyph wall.

   Two across on a phone, four on anything wide enough for two panels side by side.
   Three across put a card at 120px, which is too small to recognise an illustration
   or read a printed code — and recognising a card at a glance is the whole job of
   this screen. Two puts it at 180px, near the size of the real card in the hand.
   The cards are separated by a 2px groove rather than by a gap: on a poneglyph the
   glyphs are cut edge to edge into one surface, and a wall of them is a single
   object. Space them out and it becomes a shelf of floating tiles, which is what
   every catalogue screen looks like.

   9,447 printings: PROJECT_CONTEXT.md section 2 forbids rendering that unwindowed,
   so rows are virtualised. */
const CARD_ASPECT = 838 / 600
const GAP = 2

/* A deliberate hand on the surface, as opposed to the scroll events the restore
   itself provokes -- listening for `scroll` would cancel the restore with its own
   first frame. */
const TOUCHED = ['wheel', 'touchstart', 'keydown'] as const

/* When to re-assert the restored position, in ms. The measure pass lands within a
   frame or two; the later ones cover a slow first paint. Half a second is long enough
   to win that race and short enough not to fight a reader who has started scrolling. */
const ATTEMPTS = [0, 60, 160, 320, 500]

export function CardGrid({
  cards,
  onEndReached,
  loadingMore,
  showArt,
  columns: preferred = 2,
  initialScroll = 0,
  onScroll,
}: {
  cards: Card[]
  onEndReached?: () => void
  loadingMore?: boolean
  showArt?: boolean
  /* Two is readable, three fits more, and which is right is a taste rather than a
     viewport question -- so the caller decides and the account remembers. */
  columns?: number
  /* Where to open. The grid owns its scroll element -- it has to, the windowing is
     measured against it -- so restoring a position after a trip to a card sheet has
     to come through here rather than being done to it from outside. */
  initialScroll?: number
  onScroll?: (top: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(3)
  const [rowHeight, setRowHeight] = useState(220)

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const measure = () => {
      const width = element.clientWidth - 24 /* the wall's own 12px margin either side */
      const count = width >= 620 ? preferred * 2 : preferred
      const pocket = (width - GAP * (count - 1)) / count
      setColumns(count)
      setRowHeight(pocket * CARD_ASPECT + GAP)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [preferred])

  const rows = useMemo(() => {
    const grouped: Card[][] = []
    for (let i = 0; i < cards.length; i += columns) grouped.push(cards.slice(i, i + columns))
    return grouped
  }, [cards, columns])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 6,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [rowHeight, virtualizer])

  /* Putting the reader back where they were is a race against the grid's own first
     layout. The row height is only known once measured, so the wall is re-laid at
     least twice after mount, and each re-lay clamps a scrollTop that was set against
     the previous height. Setting it once did hold -- for exactly one commit, then the
     measured height landed and it went back to nought.

     So it is re-asserted over the first frames rather than once, and dropped as soon
     as the reader touches the surface: a hand on the glass is the one signal that
     they no longer want to be carried back. */
  const restored = useRef(false)
  useEffect(() => {
    const element = scrollRef.current
    if (!element || restored.current || !initialScroll) return

    const timers: number[] = []
    /* Tidying up is not the same as having finished, and conflating the two cost an
       afternoon: returning `done` as the cleanup meant StrictMode's throwaway first
       mount declared the job complete, so the real mount bailed on `restored` and the
       reader always landed at the top. The cleanup only cancels; only the last attempt
       or a hand on the surface may say it is done. */
    const stop = () => {
      for (const timer of timers) clearTimeout(timer)
      for (const event of TOUCHED) element.removeEventListener(event, done)
    }
    const done = () => {
      restored.current = true
      stop()
    }
    const place = () => {
      // Nothing to aim at yet: the wall is still shorter than where we are going.
      if (element.scrollHeight - element.clientHeight >= initialScroll) {
        element.scrollTop = initialScroll
      }
    }

    place()
    // Timers rather than animation frames: a tab that is not compositing never runs
    // an animation frame, and this has to survive being restored in the background.
    for (const delay of ATTEMPTS) timers.push(setTimeout(place, delay))
    timers.push(setTimeout(done, ATTEMPTS[ATTEMPTS.length - 1] + 1))
    for (const event of TOUCHED) element.addEventListener(event, done, { passive: true })

    return stop
  }, [initialScroll])

  const items = virtualizer.getVirtualItems()
  const last = items.at(-1)
  useEffect(() => {
    if (last && last.index >= rows.length - 3) onEndReached?.()
  }, [last, rows.length, onEndReached])

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll ? (event) => onScroll(event.currentTarget.scrollTop) : undefined}
      className="no-scrollbar h-full overflow-y-auto px-3 pb-28"
    >
      {/* The wall itself: the groove colour shows between the glyphs, and the whole
          surface is sunk a hair below the slab around it. */}
      <div
        className="wall p-px"
        style={{ height: virtualizer.getTotalSize() + 2, position: 'relative', boxShadow: 'var(--groove)' }}
      >
        {items.map((row) => (
          <div
            key={row.key}
            className="absolute inset-x-px grid"
            style={{
              transform: `translateY(${row.start + 1}px)`,
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gap: GAP,
            }}
          >
            {rows[row.index].map((card) => (
              <CardTile key={`${card.language}-${card.id}`} card={card} showArt={showArt} />
            ))}
          </div>
        ))}
      </div>
      {loadingMore && <p className="t-code py-5 text-center">Chargement…</p>}
    </div>
  )
}

export function CardTile({ card, showArt }: { card: Card; showArt?: boolean }) {
  const { ownedOf } = useCollection()
  const { show } = useToast()
  const [wanted, setWanted] = useState(false)
  const owned = ownedOf(card.id, card.language)
  const src = imageUrl(card)
  const variant = variantOf(card.id)
  /* Held cards are always shown. Unheld ones are an empty niche by default — on the
     binder screens the gap is the information — but the search screen passes showArt,
     because you search to identify a card, not to audit what you are missing. */
  const seated = Boolean(owned)
  const art = src && (seated || showArt)

  return (
    <Link
      to={`/card/${encodeURIComponent(card.id)}?language=${card.language}`}
      aria-label={`${card.name}, ${card.id}${owned ? `, ${owned.quantity} en collection` : ', pochette vide'}`}
    >
      <div className="group relative">
        {art ? (
          /* Inlaid, not stuck on: the artwork sits below the surface of the stone,
             so the slab casts a line of shadow across its top edge.

             Not loading="lazy". Inside the virtualiser the rows are absolutely
             positioned and transformed, and Chrome never decided these were near the
             viewport — the request returned 200 and the element sat at complete=false
             forever, which looked exactly like previews that fail to load. The
             windowing already does what lazy loading is for: only the visible rows
             plus a few exist in the DOM at all. */
          <img
            src={src!}
            alt=""
            decoding="async"
            style={
              /* Held cards are lit; the rest sit back in the stone. It is the held
                 state that gets marked, never the missing one — on a screen where you
                 own almost nothing, a "manquante" stamp on every tile is noise, and
                 dimming hard enough to be unmistakable makes the card unreadable,
                 which defeats the reason for showing it. */
              seated
                ? { boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.75), 0 0 0 1px rgba(201,162,39,0.55)' }
                : undefined
            }
            className={`inlay aspect-[600/838] w-full object-cover ${
              seated ? '' : 'opacity-65 saturate-[0.8]'
            }`}
          />
        ) : (
          <EmptyPocket code={card.id} />
        )}
        {variant && (
          /* Two printings of one card share their artwork exactly. Without this the
             grid shows what looks like the same tile twice and the collector cannot
             tell which one they are tapping. */
          <span
            className="t-code absolute top-0 left-0 px-1.5 py-0.5 text-[0.6rem]"
            style={{ background: 'rgba(4,18,26,.86)', color: 'var(--color-paper-100)' }}
          >
            {variant}
          </span>
        )}
        {/* Pointer only. A hover state is invisible on a phone, where a control that
            appears on touch would fire on the tap meant to open the card — the sheet
            stays the path there. `group-hover` plus a coarse-pointer opt-out is the
            only honest way to offer this without breaking the primary gesture. */}
        {!owned && !wanted && (
          <button
            onClick={(event) => {
              event.preventDefault()
              setWanted(true)
              api
                .addToWishlist({ card_id: card.id, language: card.language })
                .then(() => show(`${card.name} ajoutée aux recherchées`))
                .catch(() => setWanted(false))
            }}
            aria-label={`Ajouter ${card.name} aux recherchées`}
            className="absolute right-1 bottom-1 hidden size-9 place-items-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:grid"
            style={{
              background: 'var(--gradient-sun)',
              color: 'var(--color-paper-ink)',
              boxShadow: 'var(--shadow-action)',
            }}
          >
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden>
              <path
                d="M5 3h10v14l-5-3.6L5 17V3Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        {owned && owned.quantity > 1 && (
          /* Only worth saying when it is more than one. A "1" on every card you own
             is noise on a screen whose whole job is showing what you own. Struck in
             brass, like every other count in the app. */
          <span className="t-numeral absolute right-0 bottom-0 bg-sea-900/90 px-1.5 py-0.5 text-[0.65rem] text-sun-500">
            ×{owned.quantity}
          </span>
        )}
      </div>
    </Link>
  )
}
