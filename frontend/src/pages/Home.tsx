import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BoxIcon, CameraOffIcon, LayersIcon, SearchIcon, TrendIcon } from '../components/icons'
import { EmptyState, PageTitle, SectionTitle, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { useLanguage } from '../lib/language'
import type { CollectionEntry, CollectionStats, Health } from '../lib/types'

export function Home() {
  const { language } = useLanguage()
  const [stats, setStats] = useState<CollectionStats | null>(null)
  const [recent, setRecent] = useState<CollectionEntry[]>([])
  const [health, setHealth] = useState<Health | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.collectionStats(), api.collection(), api.health()])
      .then(([s, c, h]) => {
        setStats(s)
        setRecent(c.slice(0, 6))
        setHealth(h)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <Spinner />

  return (
    <div className="no-scrollbar h-full overflow-y-auto pb-32">
      <PageTitle subtitle="Ta collection One Piece">MyTGC</PageTitle>

      <div className="mx-5 rounded-(--radius-card) bg-surface p-5 shadow-sm">
        <p className="text-xs font-semibold tracking-widest text-ink-faint uppercase">
          Prime
        </p>
        <p className="display-title mt-1 text-4xl">
          {(stats?.acquisition_total ?? 0).toFixed(2)} €
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          {stats?.total_quantity ?? 0} cartes · {stats?.distinct_cards ?? 0} références
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 px-5">
        <Shortcut to="/packs" label="Extensions" icon={<LayersIcon className="size-6" />} />
        <Shortcut to="/search" label="Rechercher" icon={<SearchIcon className="size-6" />} />
        <Shortcut to="/collection" label="Collection" icon={<BoxIcon className="size-6" />} />
      </div>

      {health && !health.scan_enabled && (
        <div className="mx-5 mt-4 flex gap-3 rounded-(--radius-card) bg-gold-soft p-4">
          <CameraOffIcon className="size-6 shrink-0 text-gold" />
          <p className="text-sm text-ink-soft">
            <span className="font-semibold text-ink">Scan indisponible.</span> La
            reconnaissance attend d'être mesurée sur de vraies cartes photographiées.
            L'ajout manuel fonctionne normalement.
          </p>
        </div>
      )}

      <SectionTitle hint="Les dernières cartes ajoutées à ta collection">
        Ajouts récents
      </SectionTitle>
      {recent.length === 0 ? (
        <EmptyState icon={<TrendIcon className="size-9" />}>
          Aucune carte pour l'instant. Parcours une extension pour en ajouter.
        </EmptyState>
      ) : (
        <ul className="mx-5 divide-y divide-black/5 overflow-hidden rounded-(--radius-card) bg-surface">
          {recent.map((entry) => (
            <li key={entry.id}>
              <Link
                to={`/card/${encodeURIComponent(entry.card_id)}?language=${entry.language}`}
                className="flex items-center gap-3 p-3"
              >
                <span className="min-w-0 flex-1 truncate font-medium">
                  {entry.card?.name ?? entry.card_id}
                </span>
                <span className="text-sm text-ink-faint">×{entry.quantity}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <SectionTitle>Catalogue</SectionTitle>
      <div className="mx-5 rounded-(--radius-card) bg-surface p-4 text-sm text-ink-soft">
        {Object.entries(health?.catalogue ?? {}).map(([code, count]) => (
          <p key={code}>
            {code === 'en' ? 'International' : 'Japon'} : {count.toLocaleString('fr')} cartes
            {code === language && ' · édition active'}
          </p>
        ))}
      </div>
    </div>
  )
}

function Shortcut({
  to,
  label,
  icon,
}: {
  to: string
  label: string
  icon: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center gap-2 rounded-2xl bg-surface py-4 shadow-sm"
    >
      {icon}
      <span className="text-sm font-semibold">{label}</span>
    </Link>
  )
}
