import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { imageUrl } from '../lib/api'
import { useCollection } from '../lib/collection'
import type { Card } from '../lib/types'
import { ColorSpine } from './ui'

/* 9,447 printings. PROJECT_CONTEXT.md section 2 forbids rendering a list that size
   unvirtualized, so the grid is windowed by row. */
const CARD_ASPECT = 838 / 600
const GAP = 10

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
      const width = element.clientWidth - 24
      const count = width < 420 ? 3 : width < 640 ? 4 : Math.floor(width / 160)
      const tile = (width - GAP * (count - 1)) / count
      setColumns(count)
      setRowHeight(tile * CARD_ASPECT + 34)
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
    overscan: 5,
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
    <div ref={scrollRef} className="no-scrollbar h-full overflow-y-auto px-3 pb-32">
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
      {loadingMore && (
        <p className="py-4 text-center text-sm text-foam-faint">Chargement…</p>
      )}
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
      className="group block"
      aria-label={`${card.name}, ${card.id}${owned ? `, ${owned.quantity} en collection` : ', non possédée'}`}
    >
      <div className="relative overflow-hidden rounded-lg bg-sea-raised">
        {src ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            /* Unowned cards sit back so the collection reads at a glance; this is
               the whole point of browsing a set. */
            className={`aspect-[600/838] w-full object-cover transition ${
              owned ? '' : 'opacity-45 saturate-[0.55]'
            }`}
          />
        ) : (
          <div className="aspect-[600/838] w-full" />
        )}
        {owned && (
          <span className="voice-data absolute top-1.5 right-1.5 min-w-5 rounded-full bg-gold px-1.5 text-center text-[11px] font-bold text-sea">
            {owned.quantity}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <ColorSpine colors={card.colors} className="h-4" />
        <p className="voice-data truncate text-[11px] text-foam-faint">{card.id}</p>
      </div>
    </Link>
  )
}
