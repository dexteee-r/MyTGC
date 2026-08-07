import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Button,
  EmptyState,
  ErrorState,
  PageHeader,
  Screen,
  SectionLabel,
  Spinner,
  Tally,
} from '../components/ui'
import { imageUrl, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCollection } from '../lib/collection'
import type { Pack } from '../lib/types'

/* The front of a binder, not a dashboard.

   A collector opening theirs is not asking for a total; they are looking at which
   dividers are close to full and at what went in last. So the screen is the section
   dividers, ranked by how near each is to done, and the last few cards seated. */
export function Home() {
  const { stats, entries, ready } = useCollection()
  const { user } = useAuth()
  const [packs, setPacks] = useState<Pack[] | null>(null)
  const [failed, setFailed] = useState(false)

  /* Not filtered by the browsing edition: this summarises the whole binder, and a
     collector holding only Japanese cards was being told "nothing started" directly
     under a count of their cards. */
  const load = () => {
    setFailed(false)
    api.packs().then(setPacks).catch(() => setFailed(true))
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

  const recent = entries.slice(0, 6)

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
            className="t-code flex size-11 items-center justify-center ring-1 ring-rail"
          >
            {(user?.display_name || user?.email || '?').slice(0, 1).toUpperCase()}
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-px border-b border-rail bg-rail">
        <div className="bg-ink p-4">
          <Tally value={stats?.total_quantity ?? 0} label="cartes" />
        </div>
        <div className="bg-ink p-4">
          <Tally value={stats?.distinct_cards ?? 0} label="références" />
        </div>
      </div>

      <SectionLabel
        aside={
          started.length > 0 ? (
            <Link to="/packs" className="t-code hover:text-label">
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
            <li key={`${pack.language}-${pack.pack_id}`} className="border-b border-rail">
              <Link
                to={`/packs/${encodeURIComponent(pack.pack_code ?? pack.pack_id)}?language=${pack.language}`}
                className="block px-4 py-3.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="t-plate truncate">{pack.pack_name}</span>
                  <span className="t-stat shrink-0 text-sm">
                    {pack.owned_count}
                    <span className="text-label-faint">/{pack.card_count}</span>
                  </span>
                </div>
                <p className="t-code pt-1.5">
                  {pack.pack_code ?? '—'} · {pack.language}
                </p>
                {/* A filled strip of the page: how much of this divider is seated. */}
                <div className="mt-2.5 h-px w-full bg-rail">
                  <div
                    className="h-px bg-label"
                    style={{ width: `${(pack.owned_count / pack.card_count) * 100}%` }}
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {recent.length > 0 && (
        <>
          <SectionLabel>Rangées en dernier</SectionLabel>
          <div className="grid grid-cols-6 gap-2 px-4">
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
                    className="aspect-[600/838] w-full rounded-[0.3rem] object-cover"
                  />
                ) : (
                  <div className="pocket aspect-[600/838] w-full" />
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </Screen>
  )
}
