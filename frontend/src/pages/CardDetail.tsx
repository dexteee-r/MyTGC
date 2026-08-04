import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeftIcon, PlusIcon } from '../components/icons'
import { Button, ColorDots, Spinner } from '../components/ui'
import { api, imageUrl } from '../lib/api'
import {
  CONDITION_LABELS,
  type Card,
  type CollectionEntry,
  type Condition,
  type Language,
} from '../lib/types'

export function CardDetail() {
  const { cardId = '' } = useParams()
  const [params] = useSearchParams()
  const language = (params.get('language') ?? 'en') as Language
  const navigate = useNavigate()

  const [card, setCard] = useState<Card | null>(null)
  const [owned, setOwned] = useState<CollectionEntry | null>(null)
  const [condition, setCondition] = useState<Condition>('near_mint')
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    const [detail, collection] = await Promise.all([
      api.card(cardId, language),
      api.collection(),
    ])
    setCard(detail)
    setOwned(
      collection.find((e) => e.card_id === cardId && e.language === language) ?? null,
    )
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, language])

  if (!card) return <Spinner />

  const src = imageUrl(card)

  const add = async () => {
    setBusy(true)
    try {
      await api.addToCollection({ card_id: card.id, language, quantity: 1, condition })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const setQuantity = async (quantity: number) => {
    if (!owned) return
    setBusy(true)
    try {
      if (quantity <= 0) await api.removeFromCollection(owned.id)
      else await api.updateCollection(owned.id, { quantity })
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="no-scrollbar h-full overflow-y-auto pb-36">
      <header className="flex items-center gap-2 px-3 pt-4">
        <button onClick={() => navigate(-1)} className="p-2 text-ink-soft">
          <ChevronLeftIcon className="size-6" />
        </button>
        <span className="text-sm text-ink-faint">{card.pack_name}</span>
      </header>

      {src && (
        <img
          src={src}
          alt={card.name}
          className="mx-auto mt-2 w-[min(78%,320px)] rounded-xl shadow-lg"
        />
      )}

      <div className="px-5 pt-5">
        <h1 className="display-title text-3xl">{card.name}</h1>
        <p className="mt-1 flex items-center gap-2 text-ink-soft">
          {card.id} · {card.rarity} · {card.category}
          <ColorDots colors={card.colors} />
        </p>
      </div>

      <dl className="mx-5 mt-4 grid grid-cols-3 gap-3">
        <Stat label="Coût" value={card.cost} />
        <Stat label="Puissance" value={card.power} />
        <Stat label="Contre" value={card.counter} />
      </dl>

      {(card.effect || card.trigger) && (
        <div className="mx-5 mt-4 space-y-3 rounded-(--radius-card) bg-surface p-4 shadow-sm">
          {/* Effect text carries real newlines after import; preserve them. */}
          {card.effect && (
            <p className="text-sm leading-relaxed whitespace-pre-line">{card.effect}</p>
          )}
          {card.trigger && (
            <p className="text-sm leading-relaxed whitespace-pre-line text-ink-soft">
              <span className="font-semibold text-gold">Trigger</span> {card.trigger}
            </p>
          )}
        </div>
      )}

      {card.types.length > 0 && (
        <p className="px-5 pt-3 text-sm text-ink-soft">{card.types.join(' / ')}</p>
      )}

      {card.printings.length > 0 && (
        <section className="mt-5">
          <h2 className="px-5 pb-2 font-semibold">Autres tirages</h2>
          <p className="px-5 pb-3 text-sm text-ink-soft">
            Même illustration et même code imprimé — à toi de choisir celui que tu possèdes.
          </p>
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-5">
            {card.printings.map((id) => (
              <Link
                key={id}
                to={`/card/${encodeURIComponent(id)}?language=${language}`}
                className="shrink-0 rounded-full bg-surface px-3 py-2 text-sm shadow-sm"
              >
                {id}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mx-5 mt-6 rounded-(--radius-card) bg-surface p-4 shadow-sm">
        {owned ? (
          <>
            <p className="font-semibold">Dans ta collection</p>
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => setQuantity(owned.quantity - 1)}
                disabled={busy}
                className="size-10 rounded-full bg-sunken text-xl font-semibold text-ink-soft"
              >
                −
              </button>
              <span className="w-8 text-center text-lg font-semibold tabular-nums">
                {owned.quantity}
              </span>
              <button
                onClick={() => setQuantity(owned.quantity + 1)}
                disabled={busy}
                className="size-10 rounded-full bg-sunken text-xl font-semibold text-ink-soft"
              >
                +
              </button>
              {owned.condition && (
                <span className="ml-auto text-sm text-ink-soft">
                  {CONDITION_LABELS[owned.condition]}
                </span>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="font-semibold">Ajouter à la collection</p>
            <label className="mt-3 block text-sm text-ink-soft">
              État
              <select
                value={condition}
                onChange={(event) => setCondition(event.target.value as Condition)}
                className="mt-1 w-full rounded-xl bg-sunken px-3 py-2 text-ink outline-none"
              >
                {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4">
              <Button onClick={add} disabled={busy}>
                <span className="inline-flex items-center gap-2">
                  <PlusIcon className="size-5" /> Ajouter
                </span>
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-2xl bg-surface p-3 text-center shadow-sm">
      <dt className="text-xs tracking-wide text-ink-faint uppercase">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value ?? '—'}</dd>
    </div>
  )
}
