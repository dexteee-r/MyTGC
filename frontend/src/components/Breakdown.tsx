import { Edition } from './Edition'
import { RARITIES } from './Filters'
import type { CollectionStats, Language } from '../lib/types'

/* ── What the collection is made of ─────────────────────────────────────────
   The server has been computing by_language and by_rarity on every stats call and
   nothing has ever shown them. They answer the one question the four counters on the
   log book cannot: not how much you hold, but what kind.

   Bars rather than a table of numbers. A share is a length before it is a figure, and
   a collector reads "mostly commons" off the shape without doing arithmetic.        */

function Row({
  label,
  value,
  share,
}: {
  label: React.ReactNode
  value: number
  share: number
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[rgba(243,230,203,.12)] py-2.5">
      <span className="w-28 shrink-0 truncate text-sm">{label}</span>
      <span className="channel min-w-0 flex-1">
        <span style={{ display: 'block', width: `${Math.max(share * 100, 1.5)}%` }} />
      </span>
      <span className="t-numeral w-10 shrink-0 text-right text-sm">{value}</span>
    </div>
  )
}

export function Breakdown({ stats }: { stats: CollectionStats }) {
  const total = stats.total_quantity || 1

  /* Ordered by scarcity as the game prints it, not alphabetically: a list that runs
     Common, Leader, Rare, Special reads as noise, and the shape of a collection is
     exactly the thing this is for. Rarities absent from the collection are dropped —
     a row of zeroes says nothing. */
  const rarities = RARITIES.map((name) => [name, stats.by_rarity[name] ?? 0] as const).filter(
    ([, n]) => n > 0,
  )

  /* Anything the catalogue holds that the ordered list above does not know about, so
     a new rarity added by the game still shows up instead of quietly vanishing. */
  const extra = Object.entries(stats.by_rarity).filter(([name]) => !RARITIES.includes(name))

  const editions = (['en', 'jp'] as Language[])
    .map((code) => [code, stats.by_language[code] ?? 0] as const)
    .filter(([, n]) => n > 0)

  if (stats.total_quantity === 0) return null

  return (
    <>
      {editions.length > 1 && (
        <section className="px-5 pt-8">
          <p className="t-eyebrow pb-1">Par édition</p>
          {editions.map(([code, n]) => (
            <Row key={code} label={<Edition language={code} />} value={n} share={n / total} />
          ))}
        </section>
      )}

      <section className="px-5 pt-8">
        <p className="t-eyebrow pb-1">Par rareté</p>
        {[...rarities, ...extra].map(([name, n]) => (
          <Row key={name} label={name} value={n} share={n / total} />
        ))}
      </section>
    </>
  )
}
