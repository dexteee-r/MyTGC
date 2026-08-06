import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CompletionRing,
  ErrorState,
  PageHeader,
  Screen,
  Segmented,
  Spinner,
} from '../components/ui'
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
          <Segmented
            value={language}
            options={LANGUAGE_OPTIONS}
            onChange={setLanguage}
            label="Édition"
          />
        }
      />

      <div className="no-scrollbar overflow-x-auto px-5 pb-4">
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
      </div>

      {failed ? (
        <ErrorState onRetry={load} />
      ) : !packs ? (
        <Spinner />
      ) : (
        <ul className="space-y-2 px-5">
          {visible.map((pack) => (
            <li key={`${pack.language}-${pack.pack_id}`}>
              <Link
                to={`/packs/${encodeURIComponent(pack.pack_code ?? pack.pack_id)}?language=${pack.language}`}
                className="flex items-center gap-4 rounded-(--radius-card) bg-sea-raised p-3.5 transition active:scale-[0.995]"
              >
                <CompletionRing value={pack.owned_count} total={pack.card_count} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{pack.pack_name}</p>
                  <p className="voice-data text-sm text-foam-faint">
                    {pack.pack_code ?? 'Sans code'} · {pack.owned_count} / {pack.card_count}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  )
}
