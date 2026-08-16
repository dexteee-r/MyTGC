import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Edition } from '../components/Edition'
import {
  Button,
  EmptyState,
  ErrorState,
  Screen,
  SectionLabel,
  Spinner,
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

  /* Chosen, not ranked — the one set someone decided to finish, set from its own
     page (PackDetail). Everything else on this screen is either a total or an
     automatic ranking; this is the one thing here that is someone's intent. */
  const goal = useMemo(
    () =>
      user?.goal_pack_code && user?.goal_language
        ? ((packs ?? []).find(
            (p) => p.pack_code === user.goal_pack_code && p.language === user.goal_language,
          ) ?? null)
        : null,
    [packs, user],
  )

  const started = useMemo(
    () =>
      (packs ?? [])
        .filter((p) => p.owned_count > 0)
        // Already shown above, featured — repeating it in the ranked list would
        // just spend a slot on something already on screen.
        .filter((p) => !goal || p.pack_id !== goal.pack_id || p.language !== goal.language)
        .sort((a, b) => b.owned_count / b.card_count - a.owned_count / a.card_count)
        .slice(0, 5),
    [packs, goal],
  )

  const recent = entries.slice(0, 8)

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
      {/* The hero: the sun holds the top of the screen and the total sits on the
          horizon. It carries its own veil, and the page's solid ground starts
          exactly at its base — otherwise the two gradients cross in the middle of
          the sun's halo and draw a hard edge across the number. */}
      <header className="relative flex h-[356px] flex-col justify-end px-5 pb-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, transparent 40%, rgba(6,23,29,.34) 62%, rgba(6,23,29,.72) 100%)',
          }}
        />
        <div className="relative">
          {/* One line, ellipsised: e-mail addresses are long. */}
          <Link to="/account" className="t-eyebrow block max-w-full truncate">
            Collection One Piece · {user?.display_name ?? user?.email ?? ''} ›
          </Link>
          <div className="flex items-end gap-4 pt-2">
            <p
              className="t-numeral text-[4.875rem]"
              style={{ textShadow: '0 4px 30px rgba(0,0,0,.6)' }}
            >
              {(stats?.total_quantity ?? 0).toLocaleString('fr')}
            </p>
            <div className="pb-2">
              <p className="text-[13px] font-semibold">cartes rangées</p>
              <p className="t-code pt-1">
                {distinct.toLocaleString('fr')} références
                {catalogue > 0 &&
                  ` · ${((distinct / catalogue) * 100).toFixed(1).replace('.', ',')} % du catalogue`}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Below the water line the ground is solid: the sky has had its say. */}
      <div className="relative bg-sea-900">

      {goal && (
        <>
          <SectionLabel>Objectif</SectionLabel>
          <div className="px-5">
            <Link
              to={`/packs/${encodeURIComponent(goal.pack_code ?? goal.pack_id)}?language=${goal.language}`}
              /* The one ring this screen draws on purpose, borrowed from the same
                 "chosen" language the toggle on PackDetail already uses — not a new
                 gold or glow treatment, both of which are spoken for elsewhere:
                 gold is numerals and the primary action only, and the glow is
                 reserved for a Secret Rare on its own screen. */
              className="block rounded-[14px] px-4 py-4"
              style={{ boxShadow: 'inset 0 0 0 1px var(--surface-rail)' }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="t-plate truncate text-[1.05rem]">{goal.pack_name}</span>
                <span className="t-numeral shrink-0 text-[1.35rem]">
                  {goal.owned_count}
                  <span className="text-[var(--text-faint)]">/{goal.card_count}</span>
                </span>
              </div>
              <p className="t-code pt-1.5">
                {goal.pack_code ?? '—'} · <Edition language={goal.language} />
              </p>
              <div className="channel mt-3 w-full">
                <div style={{ width: `${(goal.owned_count / goal.card_count) * 100}%` }} />
              </div>
              {goal.owned_count === 0 && (
                <p className="pt-3 text-sm text-[var(--text-secondary)]">
                  Pas encore commencée. Scanne ta première carte de cette extension.
                </p>
              )}
            </Link>
          </div>
        </>
      )}

      {/* Nothing started besides the goal is not the same thing as an empty binder —
          the card above already shows the one thing in progress, and "Classeur
          vide" under it would flatly contradict what the person is looking at. So
          the whole section, heading included, steps aside rather than showing a
          list with one arm missing. A binder with truly nothing anywhere still gets
          the section, same as before there was a goal to set. */}
      {(started.length > 0 || !goal) && (
        <>
          <SectionLabel
            aside={
              started.length > 0 ? (
                <Link to="/packs" className="t-code hover:text-[var(--text-primary)]">
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
                <li key={`${pack.language}-${pack.pack_id}`} className="border-b border-[rgba(243,230,203,.12)]">
                  <Link
                    to={`/packs/${encodeURIComponent(pack.pack_code ?? pack.pack_id)}?language=${pack.language}`}
                    className="block px-4 py-3.5"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="t-plate truncate">{pack.pack_name}</span>
                      <span className="t-numeral shrink-0 text-sm">
                        {pack.owned_count}
                        <span className="text-[var(--text-faint)]">/{pack.card_count}</span>
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
        </>
      )}

      {recent.length > 0 && (
        <>
          <SectionLabel>Rangées en dernier</SectionLabel>
          <div className="no-scrollbar flex gap-2.5 overflow-x-auto px-5 pb-1">
            {recent.map((entry) => (
              <Link
                key={`${entry.card_id}-${entry.language}`}
                to={`/card/${encodeURIComponent(entry.card_id)}?language=${entry.language}`}
                aria-label={entry.card?.name ?? entry.card_id}
                className="w-24 shrink-0"
              >
                {entry.card && imageUrl(entry.card) ? (
                  <img
                    src={imageUrl(entry.card)!}
                    alt=""
                    className="float-lit aspect-[600/838] w-full object-cover"
                  />
                ) : (
                  <div className="sunken aspect-[600/838] w-full" />
                )}
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Not shown when the empty-binder card above already carries this exact
          button: a first launch with no goal and nothing started would otherwise
          show "Scanner une carte" twice in a row, the second one right under
          the first with nothing between them. */}
      {!(started.length === 0 && !goal) && (
        <div className="px-5 pt-8">
          <Link to="/scan" className="block">
            <Button size="lg" full>
              Scanner une carte
            </Button>
          </Link>
        </div>
      )}
      </div>
    </Screen>
  )
}
