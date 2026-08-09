import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Edition } from '../components/Edition'
import { Adrift, Chip, PageHeader, Screen, Segmented, Sounding } from '../components/ui'
import { api } from '../lib/api'
import { LANGUAGE_OPTIONS, useLanguage } from '../lib/language'
import type { Pack } from '../lib/types'

type Family = 'OP' | 'ST' | 'EB' | 'other'

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

/* ── The chart ──────────────────────────────────────────────────────────────
   A sea chart: every set is an island, and the ring around it is how much of it you
   have landed on. The ring is a conic gradient, which is the one shape that shows a
   proportion without needing a legend — you read 39% before you read "39%".

   The list answers exactly one question, which is which island to sail for next, so
   nothing else about a set appears here.                                            */
export function Packs() {
  const { language, setLanguage } = useLanguage()
  const [packs, setPacks] = useState<Pack[] | null>(null)
  const [family, setFamily] = useState<Family>('OP')
  const [failed, setFailed] = useState(false)

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

  const visible = (packs ?? []).filter((pack) => familyOf(pack) === family)
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
          one being added by the game. */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-1">
        {(Object.keys(FAMILY_LABELS) as Family[]).map((key) => (
          <Chip key={key} active={family === key} onClick={() => setFamily(key)}>
            {FAMILY_LABELS[key]}
            <span className="tabular-nums opacity-60">{counts[key]}</span>
          </Chip>
        ))}
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
