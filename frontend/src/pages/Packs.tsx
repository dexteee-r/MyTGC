import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageTitle, ProgressBar, Segmented, Spinner } from '../components/ui'
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

export function Packs() {
  const { language, setLanguage } = useLanguage()
  const [packs, setPacks] = useState<Pack[]>([])
  const [family, setFamily] = useState<Family>('OP')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api
      .packs(language)
      .then(setPacks)
      .finally(() => setLoading(false))
  }, [language])

  const counts = useMemo(() => {
    const tally: Record<Family, number> = { OP: 0, ST: 0, EB: 0, other: 0 }
    for (const pack of packs) tally[familyOf(pack)] += 1
    return tally
  }, [packs])

  const visible = packs.filter((pack) => familyOf(pack) === family)

  return (
    <div className="no-scrollbar h-full overflow-y-auto pb-32">
      <PageTitle>Extensions</PageTitle>

      <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
        <Segmented
          value={language}
          options={LANGUAGE_OPTIONS}
          onChange={(value) => setLanguage(value)}
        />
      </div>
      <div className="no-scrollbar overflow-x-auto px-5 pb-3">
        <Segmented
          value={family}
          options={(Object.keys(FAMILY_LABELS) as Family[]).map((key) => ({
            value: key,
            label: FAMILY_LABELS[key],
            badge: counts[key],
          }))}
          onChange={setFamily}
        />
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <ul className="space-y-3 px-5">
          {visible.map((pack) => (
            <li key={`${pack.language}-${pack.pack_id}`}>
              <Link
                to={`/packs/${encodeURIComponent(pack.pack_code ?? pack.pack_id)}?language=${pack.language}`}
                className="block overflow-hidden rounded-(--radius-card) bg-surface p-4 shadow-sm"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-semibold">{pack.pack_name}</span>
                  <span className="shrink-0 text-sm text-ink-faint">
                    {pack.pack_code ?? '—'}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <ProgressBar value={pack.owned_count} total={pack.card_count} />
                  <span className="shrink-0 text-sm tabular-nums text-ink-soft">
                    {pack.owned_count} / {pack.card_count}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
