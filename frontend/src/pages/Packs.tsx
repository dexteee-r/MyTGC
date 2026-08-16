import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Edition } from '../components/Edition'
import { TrendIcon } from '../components/icons'
import { Adrift, Chip, PageHeader, Screen, Segmented, Sounding } from '../components/ui'
import { api } from '../lib/api'
import { LANGUAGE_OPTIONS, useLanguage } from '../lib/language'
import type { Pack } from '../lib/types'

type Family = 'OP' | 'ST' | 'EB' | 'other'
type Order = 'code' | 'closest'

const FAMILY_LABELS: Record<Family, string> = {
  OP: 'Boosters',
  ST: 'Starters',
  EB: 'Extra',
  other: 'Promos',
}

function familyOf(pack: Pack): Family {
  const code = pack.pack_code ?? ''
  if (code.startsWith('OP')) return 'OP'
  if (code.startsWith('ST')) return 'ST'
  if (code.startsWith('EB') || code.startsWith('PRB')) return 'EB'
  return 'other'
}

const share = (pack: Pack) =>
  pack.card_count > 0 ? Math.min(1, pack.owned_count / pack.card_count) : 0

const isComplete = (pack: Pack) =>
  pack.card_count > 0 && pack.owned_count >= pack.card_count

/* "Closest to being finished", read literally: the set you are nearest to closing but
   have not. Ratio alone would put the sets you already finished on top, which is the
   opposite of the question — so they sink. Sets at zero end up down there too, and
   that is right: one you have never opened is not close to done either.

   Ties keep the order they arrived in, which is the server's by set code, because
   Array.prototype.sort is stable. Without that the dozens of sets sitting at 0%
   would shuffle on every render. */
export function byClosest(a: Pack, b: Pack) {
  if (isComplete(a) !== isComplete(b)) return isComplete(a) ? 1 : -1
  return share(b) - share(a)
}

/* ── The chart ──────────────────────────────────────────────────────────────
   A sea chart: every set is an island, and the ring around it is how much of it you
   have landed on. The ring is a conic gradient, which is the one shape that shows a
   proportion without needing a legend — you read 39% before you read "39%".

   The list answers exactly one question, which is which island to sail for next, so
   nothing else about a set appears here.                                            */
/* Where you were a moment ago, not something to remember about you — so a module
   variable, the way Chercher keeps its query. It dies with the tab, and anything
   worth persisting properly lives on the account instead.

   Opening a set unmounts this screen, and that round trip is the whole point of the
   list: sort by what is nearly done, open the top one, come back. Without this the
   order resets every time, which is to say exactly when it was being used. The
   family is kept for the same reason — restoring the order but dropping you back on
   Boosters would only be half a fix. */
let left: { family: Family; order: Order } = { family: 'OP', order: 'code' }

export function Packs() {
  const { language, setLanguage } = useLanguage()
  const [packs, setPacks] = useState<Pack[] | null>(null)
  const [family, setFamilyState] = useState<Family>(left.family)
  const [order, setOrderState] = useState<Order>(left.order)
  const [failed, setFailed] = useState(false)

  /* Written on the way through rather than in an effect: StrictMode mounts effects
     twice in dev, and this only ever needs to record a choice as it is made. */
  const setFamily = (next: Family) => {
    left.family = next
    setFamilyState(next)
  }
  const setOrder = (next: Order) => {
    left.order = next
    setOrderState(next)
  }

  const load = () => {
    setPacks(null)
    setFailed(false)
    api.packs(language).then(setPacks).catch(() => setFailed(true))
  }
  useEffect(load, [language])

  const counts = useMemo(() => {
    const tally: Record<Family, number> = { OP: 0, ST: 0, EB: 0, other: 0 }
    for (const pack of packs ?? []) tally[familyOf(pack)] += 1
    return tally
  }, [packs])

  /* filter() already returns a fresh array, so sorting it in place never touches the
     loaded packs. */
  const visible = useMemo(() => {
    const list = (packs ?? []).filter((pack) => familyOf(pack) === family)
    return order === 'closest' ? list.sort(byClosest) : list
  }, [packs, family, order])

  const owned = visible.reduce((n, p) => n + p.owned_count, 0)
  const size = visible.reduce((n, p) => n + p.card_count, 0)

  return (
    <Screen>
      <PageHeader
        title="Extensions"
        meta={size ? `${owned} sur ${size} cartes` : undefined}
        action={
          <div className="w-[126px]">
            <Segmented value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} label="Édition" />
          </div>
        }
      />

      {/* Families as light pills rather than a segmented block: there are four of
          them, they are a filter and not a mode, and the row has to survive a fifth
          one being added by the game.

          The order rides the same row, pinned outside the scroller. Inside it, it
          would slide out of reach as soon as that fifth family arrives; on a row of
          its own it took the full-width weight of a mode switch, which an ordering
          is not — it changes where the sets sit, never which ones are listed. */}
      <div className="flex items-center gap-2 px-5 pb-1">
        <div className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto">
          {(Object.keys(FAMILY_LABELS) as Family[]).map((key) => (
            <Chip key={key} active={family === key} onClick={() => setFamily(key)}>
              {FAMILY_LABELS[key]}
              <span className="tabular-nums opacity-60">{counts[key]}</span>
            </Chip>
          ))}
        </div>

        <span
          aria-hidden
          className="h-6 w-px shrink-0"
          style={{ background: 'var(--surface-rail)' }}
        />

        {/* A toggle, so the label names the axis and stays put while aria-pressed and
            the weight carry the state — a caption that rewrote itself would make the
            control read as the answer rather than as the question. Quieter than an
            active chip on purpose: gold belongs to numerals and the primary action. */}
        <button
          onClick={() => setOrder(order === 'closest' ? 'code' : 'closest')}
          aria-pressed={order === 'closest'}
          className="inline-flex min-h-[var(--touch)] shrink-0 items-center gap-1.5 rounded-full px-3 text-sm transition"
          style={{
            color: order === 'closest' ? 'var(--text-primary)' : 'var(--text-secondary)',
            boxShadow: order === 'closest' ? 'inset 0 0 0 1px var(--surface-rail)' : 'none',
            fontWeight: order === 'closest' ? 600 : 400,
          }}
        >
          <TrendIcon className="size-4" />
          Avancement
        </button>
      </div>

      {failed ? (
        <div className="pt-8"><Adrift onRetry={load} /></div>
      ) : !packs ? (
        <div className="pt-8"><Sounding label="Relevé des extensions" /></div>
      ) : (
        <ul className="pt-2">
          {visible.map((pack) => (
            <li
              key={`${pack.language}-${pack.pack_id}`}
              className="border-b border-[rgba(243,230,203,.12)]"
            >
              <Link
                to={`/packs/${encodeURIComponent(pack.pack_code ?? pack.pack_id)}?language=${pack.language}`}
                className="flex items-center gap-3.5 px-5 py-[18px]"
              >
                <Island owned={pack.owned_count} total={pack.card_count} />
                <div className="min-w-0 flex-1">
                  <p className="t-display truncate text-[1rem]">{pack.pack_name}</p>
                  <p className="t-code flex items-center gap-1.5 pt-1.5">
                    {pack.pack_code ?? 'Sans code'} · <Edition language={pack.language} />
                  </p>
                </div>
                <span className="t-numeral shrink-0 text-[1.05rem]">
                  {pack.owned_count}
                  <span className="text-[var(--text-faint)]">/{pack.card_count}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  )
}

/* How much of an island has been landed on. A conic gradient rather than a bar: the
   ring reads as a proportion at a glance and holds its meaning at 42px, where a bar
   this short would be three pixels of gold nobody can measure. */
function Island({ owned, total }: { owned: number; total: number }) {
  const share = total > 0 ? Math.min(1, owned / total) : 0
  const percent = Math.round(share * 100)
  return (
    <span
      aria-hidden
      className="relative grid size-[42px] shrink-0 place-items-center rounded-full"
      style={{
        background: `conic-gradient(var(--accent-numeral) ${share * 360}deg, rgba(4,18,26,.65) 0)`,
        boxShadow: 'inset 0 0 0 1px rgba(243,230,203,.14)',
      }}
    >
      <span
        className="grid size-[34px] place-items-center rounded-full text-[10px] font-semibold tabular-nums"
        style={{ background: 'var(--color-sea-900)', color: percent ? 'var(--accent-numeral)' : 'var(--text-faint)' }}
      >
        {percent}%
      </span>
    </span>
  )
}
