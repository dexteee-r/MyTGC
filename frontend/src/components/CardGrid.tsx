import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { imageUrl } from '../lib/api'
import type { Card } from '../lib/types'

/* The catalogue is 9,447 printings. PROJECT_CONTEXT.md section 2 forbids rendering a
   list like that unvirtualized, so the grid is windowed by row. */
const CARD_ASPECT = 838 / 600
const GAP = 12

export function CardGrid({
  cards,
  onEndReached,
  footer,
}: {
  cards: Card[]
  onEndReached?: () => void
  footer?: React.ReactNode
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(3)
  const [rowHeight, setRowHeight] = useState(200)

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const measure = () => {
      const width = element.clientWidth - 24
      const count = width < 380 ? 3 : width < 640 ? 4 : Math.floor(width / 150)
      const tile = (width - GAP * (count - 1)) / count
      setColumns(count)
      // Row = artwork + two lines of caption.
      setRowHeight(tile * CARD_ASPECT + 42)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const rows = useMemo(() => {
    const grouped: Card[][] = []
    for (let i = 0; i < cards.length; i += columns) {
      grouped.push(cards.slice(i, i + columns))
    }
    return grouped
  }, [cards, columns])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 4,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [rowHeight, virtualizer])

  const items = virtualizer.getVirtualItems()
  const last = items.at(-1)
  useEffect(() => {
    if (last && last.index >= rows.length - 2) onEndReached?.()
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
      {footer}
    </div>
  )
}

export function CardTile({ card }: { card: Card }) {
  const src = imageUrl(card)
  return (
    <Link to={`/card/${encodeURIComponent(card.id)}?language=${card.language}`}>
      <div className="overflow-hidden rounded-xl bg-sunken shadow-sm">
        {src ? (
          <img
            src={src}
            alt={card.name}
            loading="lazy"
            className="aspect-[600/838] w-full object-cover"
          />
        ) : (
          <div className="aspect-[600/838] w-full" />
        )}
      </div>
      <p className="mt-1 truncate text-xs font-medium">{card.name}</p>
      <p className="truncate text-[11px] text-ink-faint">
        {card.id} · {card.rarity}
      </p>
    </Link>
  )
}
