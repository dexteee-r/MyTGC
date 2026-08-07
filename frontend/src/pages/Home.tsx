import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Edition } from '../components/Edition'
import {
  Button,
  EmptyState,
  ErrorState,
  Groove,
  PageHeader,
  Screen,
  SectionLabel,
  Spinner,
  Tally,
} from '../components/ui'
import { imageUrl, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCollection } from '../lib/collection'
import type { Health, Pack } from '../lib/types'

/* The front of a binder, not a dashboard.

   A collector opening theirs is not asking for a total; they are looking at which
   dividers are close to full and at what went in last. So the screen is the section
   dividers, ranked by how near each is to done, and the last few cards seated. */
export function Home() {
  const { stats, entries, ready } = useCollection()
  const { user } = useAuth()
  const [packs, setPacks] = useState<Pack[] | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [failed, setFailed] = useState(false)

  /* Not filtered by the browsing edition: this summarises the whole binder, and a
     collector holding only Japanese cards was being told "nothing started" directly
     under a count of their cards. */
  const load = () => {
    setFailed(false)
    api.packs().then(setPacks).catch(() => setFailed(true))
    api.health().then(setHealth).catch(() => {})
  }
  useEffect(load, [])

  const started = useMemo(
    () =>
      (packs ?? [])
        .filter((p) => p.owned_count > 0)
        .sort((a, b) => b.owned_count / b.card_count - a.owned_count / a.card_count)
        .slice(0, 5),
    [packs],
  )

  const recent = entries.slice(0, 12)

  /* The size of the whole catalogue, both editions. /health already publishes it —
     asking again would be a second source of the same number. */
  const catalogue = useMemo(
     () => Object.values(health?.catalogue ?? {}).reduce((sum, n) => sum + n, 0),
     [health],
  )
  const distinct = stats?.distinct_cards ?? 0

  if (failed) return <Screen><div className="pt-14"><ErrorState onRetry={load} /></div></Screen>
  if (!ready || !packs) return <Spinner />

  return (
    <Screen>
      <PageHeader
        title="Classeur"
        meta={user?.display_name ?? user?.email ?? undefined}
        action={
          <Link
            to="/account"
            aria-label="Compte"
            style={{ boxShadow: 'var(--relief)' }}
            className="t-inscribed flex size-11 items-center justify-center rounded-full bg-stone-lit text-sm text-brass"
          >
            {(user?.display_name || user?.email || '?').slice(0, 1).toUpperCase()}
          </Link>
        }
      />

      <div className="grid grid-cols-2 wall gap-px">
        <div className="bg-stone p-4">
          <Tally value={stats?.total_quantity ?? 0} label="cartes" />
        </div>
        <div className="bg-stone p-4">
          <Tally value={stats?.distinct_cards ?? 0} label="références" />
        </div>
      </div>

      {/* How much of the whole catalogue is carved. The two counts above say how much
          you hold; neither says how far along you are, which is the question a
          collector is actually asking. One channel, under both. */}
      {catalogue > 0 && (
        <div className="relative px-4 pt-4 pb-5">
          <div className="channel w-full">
            <div style={{ width: `${Math.min(100, (distinct / catalogue) * 100)}%` }} />
          </div>
          <p className="t-code pt-2.5">
            {((distinct / catalogue) * 100).toFixed(1).replace('.', ',')} % du catalogue ·{' '}
            {catalogue.toLocaleString('fr')} références connues
          </p>
          <Groove />
        </div>
      )}

      <SectionLabel
        aside={
          started.length > 0 ? (
            <Link to="/packs" className="t-code hover:text-carve">
              Toutes
            </Link>
          ) : undefined
        }
      >
        Intercalaires en cours
      </SectionLabel>

      {started.length === 0 ? (
        <EmptyState
          title="Classeur vide"
          action={
            <Link to="/scan">
              <Button size="lg">Scanner une carte</Button>
            </Link>
          }
        >
          Scanne une carte, ou ouvre une extension pour voir ce qu'il te manque.
        </EmptyState>
      ) : (
        <ul>
          {started.map((pack) => (
            <li key={`${pack.language}-${pack.pack_id}`} className="cut">
              <Link
                to={`/packs/${encodeURIComponent(pack.pack_code ?? pack.pack_id)}?language=${pack.language}`}
                className="block px-4 py-3.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="t-plate truncate">{pack.pack_name}</span>
                  <span className="t-stat shrink-0 text-sm">
                    {pack.owned_count}
                    <span className="text-carve-faint">/{pack.card_count}</span>
                  </span>
                </div>
                <p className="t-code pt-1.5">
                  {pack.pack_code ?? '—'} · <Edition language={pack.language} />
                </p>
                {/* A filled strip of the page: how much of this divider is seated. */}
                <div className="channel mt-2.5 w-full">
                  <div style={{ width: `${(pack.owned_count / pack.card_count) * 100}%` }} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {recent.length > 0 && (
        <>
          <SectionLabel>Rangées en dernier</SectionLabel>
          <div className="wall mx-3 grid grid-cols-6 gap-px p-px">
            {recent.map((entry) => (
              <Link
                key={entry.id}
                to={`/card/${encodeURIComponent(entry.card_id)}?language=${entry.language}`}
                aria-label={entry.card?.name ?? entry.card_id}
              >
                {entry.card && imageUrl(entry.card) ? (
                  <img
                    src={imageUrl(entry.card)!}
                    alt=""
                    className="inlay aspect-[600/838] w-full object-cover"
                  />
                ) : (
                  <div className="niche aspect-[600/838] w-full" />
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </Screen>
  )
}
