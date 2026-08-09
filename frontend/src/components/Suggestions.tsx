import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Edition, variantOf } from './Edition'
import { imageUrl } from '../lib/api'
import { useCollection } from '../lib/collection'
import type { Card } from '../lib/types'

/* ── What you are typing at ─────────────────────────────────────────────────
   A grid of artwork is the wrong shape for "which printing is this". Four tiles of
   Kid & Killer look identical; four named rows do not. So while a query is being
   typed the field offers the cards by name, code and version — and tapping one goes
   straight to it rather than filtering a grid you would then have to read.

   No extra request: these are the first rows of the search already running behind
   the panel, shown in a different shape.                                          */

const MAX = 8

export function Suggestions({
  cards,
  query,
  onDismiss,
}: {
  cards: Card[]
  query: string
  onDismiss: () => void
}) {
  const navigate = useNavigate()
  const { ownedOf } = useCollection()
  const [active, setActive] = useState(0)
  const list = cards.slice(0, MAX)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => setActive(0), [query])

  /* Arrow keys and Enter, because this hangs off a text field and a keyboard is how
     a text field is used on the desktop half of the app. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return onDismiss()
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActive((i) => Math.min(i + 1, list.length - 1))
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActive((i) => Math.max(i - 1, 0))
      }
      if (event.key === 'Enter' && list[active]) {
        event.preventDefault()
        open(list[active])
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  /* A tap outside is a dismissal. Pointerdown rather than click, so the field losing
     focus does not race the row being chosen. */
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) onDismiss()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [onDismiss])

  const open = (card: Card) => {
    onDismiss()
    navigate(`/card/${encodeURIComponent(card.id)}?language=${card.language}`)
  }

  if (list.length === 0) return null

  return (
    <div
      ref={box}
      role="listbox"
      aria-label="Suggestions"
      className="hz-enter absolute inset-x-5 top-full z-30 overflow-hidden rounded-[18px]"
      style={{
        background: 'var(--color-sea-800)',
        boxShadow: '0 18px 40px rgba(0,0,0,.6), inset 0 0 0 1px var(--surface-rail)',
      }}
    >
      {list.map((card, index) => {
        const variant = variantOf(card.id)
        const held = ownedOf(card.id, card.language)
        const src = imageUrl(card)
        return (
          <button
            key={`${card.id}-${card.language}`}
            role="option"
            aria-selected={index === active}
            onPointerEnter={() => setActive(index)}
            onClick={() => open(card)}
            className="flex w-full min-h-[var(--touch)] items-center gap-3 px-3 py-2 text-left"
            style={{
              background: index === active ? 'rgba(243,230,203,.09)' : 'transparent',
            }}
          >
            {src ? (
              <img src={src} alt="" className="h-11 w-8 shrink-0 rounded-[2px] object-cover" />
            ) : (
              <span className="sunken h-11 w-8 shrink-0" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{card.name}</span>
              <span className="t-code flex items-center gap-1.5 pt-0.5">
                {card.id.replace(/_[a-z]\d+$/i, '')}
                {variant && ` (${variant})`} · <Edition language={card.language} />
              </span>
            </span>
            {/* What you actually want to know while typing: do I already have it. */}
            {held && (
              <span className="t-numeral shrink-0 text-sm">×{held.quantity}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
