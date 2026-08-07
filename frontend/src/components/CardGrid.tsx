import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { imageUrl } from '../lib/api'
import { useCollection } from '../lib/collection'
import type { Card } from '../lib/types'
import { EmptyPocket } from './ui'

/* A binder page is three pockets across, so this is three across. Wider screens get
   six — two pages open side by side — rather than an arbitrary number that fits.

   9,447 printings: PROJECT_CONTEXT.md section 2 forbids rendering that unwindowed,
   so rows are virtualised. */
const CARD_ASPECT = 838 / 600
const GAP = 8

export function CardGrid({
  cards,
  onEndReached,
  loadingMore,
}: {
  cards: Card[]
  onEndReached?: () => void
  loadingMore?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(3)
  const [rowHeight, setRowHeight] = useState(220)

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const measure = () => {
      const width = element.clientWidth - 32
      const count = width >= 620 ? 6 : 3
      const pocket = (width - GAP * (count - 1)) / count
      setColumns(count)
      setRowHeight(pocket * CARD_ASPECT + 26)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

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

  const items = virtualizer.getVirtualItems()
  const last = items.at(-1)
  useEffect(() => {
    if (last && last.index >= rows.length - 3) onEndReached?.()
  }, [last, rows.length, onEndReached])

  return (
    <div ref={scrollRef} className="no-scrollbar h-full overflow-y-auto px-4 pb-28">
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {items.map((row) => (
          <div
            key={row.key}
            className="absolute inset-x-0 grid"
            style={{
              transform: `translateY(${row.start}px)`,
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gap: GAP,
            }}
          >
            {rows[row.index].map((card) => (
              <CardTile key={`${card.language}-${card.id}`} card={card} />
            ))}
          </div>
        ))}
      </div>
      {loadingMore && <p className="t-code py-5 text-center">Chargement…</p>}
    </div>
  )
}

export function CardTile({ card }: { card: Card }) {
  const { ownedOf } = useCollection()
  const owned = ownedOf(card.id, card.language)
  const src = imageUrl(card)

  return (
    <Link
      to={`/card/${encodeURIComponent(card.id)}?language=${card.language}`}
      aria-label={`${card.name}, ${card.id}${owned ? `, ${owned.quantity} en collection` : ', pochette vide'}`}
    >
      <div className="relative">
        {owned && src ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            className="aspect-[600/838] w-full rounded-[0.35rem] object-cover"
          />
        ) : (
          <EmptyPocket code={card.id} />
        )}
        {owned && owned.quantity > 1 && (
          /* Only worth saying when it is more than one. A "1" on every card you own
             is noise on a screen whose whole job is showing what you own. */
          <span className="t-stat absolute right-1 bottom-1 rounded-xs bg-ink/85 px-1.5 py-0.5 text-xs text-label">
            ×{owned.quantity}
          </span>
        )}
      </div>
    </Link>
  )
}
