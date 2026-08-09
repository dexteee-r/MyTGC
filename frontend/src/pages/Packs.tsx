import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Edition } from '../components/Edition'
import { ErrorState, PageHeader, Screen, Segmented, Spinner } from '../components/ui'
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

/* The dividers in the binder, listed. Each one says how full it is; nothing else
   about a set matters from here. */
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
          <div className="w-40">
            <Segmented value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} label="Édition" />
          </div>
        }
      />

      <Segmented
        value={family}
        options={(Object.keys(FAMILY_LABELS) as Family[]).map((key) => ({
          value: key,
          label: FAMILY_LABELS[key],
          badge: counts[key],
        }))}
        onChange={setFamily}
        label="Type d'extension"
      />

      {failed ? (
        <div className="pt-8"><ErrorState onRetry={load} /></div>
      ) : !packs ? (
        <Spinner />
      ) : (
        <ul>
          {visible.map((pack) => (
            <li key={`${pack.language}-${pack.pack_id}`} className="border-b border-[rgba(243,230,203,.12)]">
              <Link
                to={`/packs/${encodeURIComponent(pack.pack_code ?? pack.pack_id)}?language=${pack.language}`}
                className="block px-4 py-3.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="t-deck truncate">{pack.pack_name}</span>
                  <span className="t-numeral shrink-0 text-sm">
                    {pack.owned_count}
                    <span className="text-[var(--text-faint)]">/{pack.card_count}</span>
                  </span>
                </div>
                <p className="t-code flex items-center gap-1.5 pt-1.5">
                  {pack.pack_code ?? 'Sans code'} · <Edition language={pack.language} />
                </p>
                <div className="channel mt-2.5 w-full">
                  <div style={{ width: `${(pack.owned_count / pack.card_count) * 100}%` }} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  )
}
