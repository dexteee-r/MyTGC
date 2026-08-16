import { useMemo, useState } from 'react'
import { money } from '../lib/money'
import type { PricePoint } from '../lib/types'

/* ── The trend, not the number again ──────────────────────────────────────────
   The card sheet already leads with the current cote in the big numeral — this
   chart's job is the shape of how it got there, not a second copy of the same
   figure. So the current point carries no end-label or end-dot by default; only
   a finger or a pointer asking for one gets a readout.

   Form, per the project's own charting method: a trend over time with a single
   series is a line, area for the fill. Color is the app's own numeral gold
   (--accent-numeral) — a price is exactly the kind of numeral that rule already
   covers, so nothing new is invented here. Single series needs no legend; the
   section heading above already names what is plotted. */

const W = 320
const H = 96
const PAD_X = 4

export function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr', {
    day: 'numeric',
    month: 'short',
  })
}

/* Spaced by elapsed time, not by index. The importer only promises a row roughly
   every 3 days -- it skips a run rather than write a stale figure -- so a real gap
   is data (a stretch of no read, not "nothing changed"), and index-spacing would
   iron it flat as if every gap were the same width. Pulled out of the component so
   the one thing genuinely easy to get wrong here -- this spacing, and the
   flat-price divide-by-zero guard -- is pinned by a test, not just eyeballed once
   in a browser. */
export function computeGeometry(points: PricePoint[]) {
  if (points.length < 2) return null

  const times = points.map((p) => new Date(`${p.captured_at}T00:00:00`).getTime())
  const prices = points.map((p) => p.price)
  const t0 = times[0]
  const tSpan = times[times.length - 1] - t0 || 1
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  // A flat run (every snapshot identical) would divide by zero; padding it out
  // keeps the line a visible flat stroke instead of a NaN path.
  const span = max - min || Math.max(max * 0.1, 1)
  const lo = min - span * 0.08
  const hi = max + span * 0.08

  const xy = points.map((p, i) => ({
    x: PAD_X + ((times[i] - t0) / tSpan) * (W - PAD_X * 2),
    y: H - ((p.price - lo) / (hi - lo)) * H,
  }))

  const line = xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `${line} L${xy[xy.length - 1].x.toFixed(1)},${H} L${xy[0].x.toFixed(1)},${H} Z`

  return { xy, line, area, min, max }
}

export function PriceChart({ points }: { points: PricePoint[] }) {
  const [hover, setHover] = useState<number | null>(null)

  const geometry = useMemo(() => computeGeometry(points), [points])

  if (!geometry) return null
  const { xy, line, area, min, max } = geometry

  const nearest = (clientX: number, rect: DOMRect) => {
    const ratio = (clientX - rect.left) / rect.width
    const target = ratio * W
    let best = 0
    let bestDist = Infinity
    xy.forEach((p, i) => {
      const dist = Math.abs(p.x - target)
      if (dist < bestDist) {
        bestDist = dist
        best = i
      }
    })
    return best
  }

  const active = hover != null ? points[hover] : null
  const activeXY = hover != null ? xy[hover] : null
  // Clamped so the tooltip never runs off either edge of a narrow phone screen.
  const tooltipLeft = activeXY
    ? `${Math.min(88, Math.max(12, (activeXY.x / W) * 100))}%`
    : '50%'

  return (
    <div className="relative">
      <div className="flex items-baseline justify-between">
        <p className="t-code text-[var(--text-faint)]">{money(max)}</p>
      </div>

      <div className="relative mt-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block h-24 w-full touch-none"
          onPointerMove={(event) =>
            setHover(nearest(event.clientX, event.currentTarget.getBoundingClientRect()))
          }
          onPointerDown={(event) =>
            setHover(nearest(event.clientX, event.currentTarget.getBoundingClientRect()))
          }
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="price-wash" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-numeral)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="var(--accent-numeral)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#price-wash)" stroke="none" />
          <path
            d={line}
            fill="none"
            stroke="var(--accent-numeral)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {activeXY && (
            <>
              <line
                x1={activeXY.x}
                x2={activeXY.x}
                y1="0"
                y2={H}
                stroke="var(--surface-rail)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              {/* The surface ring is what keeps the dot legible where it crosses its
                  own line, per the project's chart method — not a border, a punched
                  gap in the fill colour underneath it. */}
              <circle cx={activeXY.x} cy={activeXY.y} r="5" fill="var(--color-sea-900)" />
              <circle cx={activeXY.x} cy={activeXY.y} r="3.5" fill="var(--accent-numeral)" />
            </>
          )}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute -top-1 -translate-x-1/2 -translate-y-full rounded-lg px-2.5 py-1.5 text-center whitespace-nowrap"
            style={{ left: tooltipLeft, background: 'var(--color-sea-900)', boxShadow: 'var(--shadow-deck)' }}
          >
            <p className="t-numeral text-[0.85rem] leading-none">{money(active.price)}</p>
            <p className="t-code pt-0.5 text-[0.6rem] text-[var(--text-faint)]">
              {formatDate(active.captured_at)}
            </p>
          </div>
        )}
      </div>

      <div className="mt-1 flex items-baseline justify-between">
        <p className="t-code text-[var(--text-faint)]">{formatDate(points[0].captured_at)}</p>
        <p className="t-code text-[var(--text-faint)]">{money(min)}</p>
        <p className="t-code text-[var(--text-faint)]">
          {formatDate(points[points.length - 1].captured_at)}
        </p>
      </div>

      {/* The curve is decorative to a screen reader; the trend it draws is not.
          Table view scaled to what this is — a small trend indicator on a card
          sheet, not a dashboard — rather than a toggle nobody on a phone needs. */}
      <p className="sr-only">
        Cote du {formatDate(points[0].captured_at)} au {formatDate(points[points.length - 1].captured_at)} :
        de {money(min)} à {money(max)}.
      </p>
    </div>
  )
}
