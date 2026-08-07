import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LogPoseIcon } from '../components/icons'
import {
  Button,
  CARD_COLORS,
  CompletionRing,
  EmptyState,
  ErrorState,
  PageHeader,
  Screen,
  SectionTitle,
  Spinner,
} from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCollection } from '../lib/collection'
import type { Card, Pack } from '../lib/types'

/* The hero is not a total. A collector's live question is which set is closest to
   done, so that is what opens the screen — the sets already under way, ranked by
   how near they are, with the colour balance of the collection underneath. */
export function Home() {
  const { stats, entries, ready } = useCollection()
  const { user } = useAuth()
  const [packs, setPacks] = useState<Pack[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [colors, setColors] = useState<Record<string, number>>({})

  /* Deliberately not filtered by the browsing edition. Home summarises the whole
     collection, and a collector holding only Japanese cards was being told
     "nothing started" directly under a count of 19 cards. The edition selector
     belongs to browsing, not to the overview. */
  const load = () => {
    setFailed(false)
    api.packs().then(setPacks).catch(() => setFailed(true))
  }
  useEffect(load, [])

  // Colour balance is derived from the cards actually owned, so it needs their
  // records — cheap for a personal collection, and it is the identity of the
  // collection rather than a decorative chart.
  useEffect(() => {
    if (!entries.length) return setColors({})
    let cancelled = false
    Promise.all(
      entries.slice(0, 400).map((entry) =>
        api.card(entry.card_id, entry.language).catch(() => null),
      ),
    ).then((cards) => {
      if (cancelled) return
      const tally: Record<string, number> = {}
      cards.forEach((card: Card | null, i) => {
        if (!card) return
        const qty = entries[i].quantity
        for (const color of card.colors) tally[color] = (tally[color] ?? 0) + qty
      })
      setColors(tally)
    })
    return () => {
      cancelled = true
    }
  }, [entries])

  const started = useMemo(
    () =>
      (packs ?? [])
        .filter((p) => p.owned_count > 0)
        .sort((a, b) => b.owned_count / b.card_count - a.owned_count / a.card_count)
        .slice(0, 4),
    [packs],
  )

  if (failed) return <Screen><div className="pt-16"><ErrorState onRetry={load} /></div></Screen>
  if (!ready || !packs) return <Spinner />

  const total = stats?.total_quantity ?? 0

  return (
    <Screen>
      <PageHeader
        title="MyTCG"
        meta={`${total} carte${total > 1 ? 's' : ''} · ${stats?.distinct_cards ?? 0} référence${(stats?.distinct_cards ?? 0) > 1 ? 's' : ''}`}
        action={
          <Link
            to="/account"
            aria-label="Compte"
            className="flex size-11 items-center justify-center rounded-full bg-sea-raised font-semibold"
          >
            {(user?.display_name || user?.email || '?').slice(0, 1).toUpperCase()}
          </Link>
        }
      />

      <SectionTitle
        aside={
          started.length > 0 ? (
            <Link to="/packs" className="text-sm text-foam-dim">
              Toutes
            </Link>
          ) : undefined
        }
      >
        Extensions en cours
      </SectionTitle>

      {started.length === 0 ? (
        <EmptyState
          title="Rien de commencé"
          action={
            <Link to="/scan">
              <Button size="lg">
                <LogPoseIcon className="size-5" />
                Scanner ta première carte
              </Button>
            </Link>
          }
        >
          Scanne une carte ou parcours une extension pour lancer une collection.
        </EmptyState>
      ) : (
        <ul className="space-y-2 px-5">
          {started.map((pack) => (
            <li key={pack.pack_id}>
              <Link
                to={`/packs/${encodeURIComponent(pack.pack_code ?? pack.pack_id)}?language=${pack.language}`}
                className="flex items-center gap-4 rounded-(--radius-card) bg-sea-raised p-3.5"
              >
                <CompletionRing value={pack.owned_count} total={pack.card_count} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{pack.pack_name}</p>
                  <p className="voice-data text-sm text-foam-faint">
                    {pack.pack_code ?? '—'} · {pack.owned_count} / {pack.card_count} ·{' '}
                    {pack.language.toUpperCase()}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {total > 0 && <ColorBalance tally={colors} total={total} />}
    </Screen>
  )
}

/* Six colours is the axis One Piece is built on. Showing the collection's balance
   across them says something true about it that a total never could. */
function ColorBalance({ tally, total }: { tally: Record<string, number>; total: number }) {
  const sum = Object.values(tally).reduce((a, b) => a + b, 0)
  if (!sum) return null

  return (
    <>
      <SectionTitle>Répartition par couleur</SectionTitle>
      <div className="px-5">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-sea-raised">
          {CARD_COLORS.filter((c) => tally[c]).map((color) => (
            <span
              key={color}
              style={{
                width: `${(tally[color] / sum) * 100}%`,
                background: `var(--color-op-${color.toLowerCase()})`,
              }}
            />
          ))}
        </div>
        <ul className="mt-3 grid grid-cols-3 gap-y-2">
          {CARD_COLORS.filter((c) => tally[c]).map((color) => (
            <li key={color} className="flex items-center gap-2 text-sm">
              <span
                className="size-2.5 rounded-full"
                style={{ background: `var(--color-op-${color.toLowerCase()})` }}
              />
              <span className="text-foam-dim">{color}</span>
              <span className="voice-data text-foam-faint">{tally[color]}</span>
            </li>
          ))}
        </ul>
        <p className="pt-3 text-xs text-foam-faint">
          Les cartes bicolores comptent dans leurs deux couleurs, d'où un total
          supérieur aux {total} cartes.
        </p>
      </div>
    </>
  )
}
