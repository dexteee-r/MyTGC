import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeftIcon } from '../components/icons'
import {
  Button,
  ColorSpine,
  ErrorState,
  Screen,
  Spinner,
  Stepper,
} from '../components/ui'
import { api, imageUrl } from '../lib/api'
import { useCollection } from '../lib/collection'
import { useToast } from '../lib/toast'
import { CONDITION_LABELS, type Card, type Condition, type Language } from '../lib/types'

export function CardDetail() {
  const { cardId = '' } = useParams()
  const [params] = useSearchParams()
  const language = (params.get('language') ?? 'en') as Language
  const navigate = useNavigate()
  const { ownedOf, add, setQuantity } = useCollection()
  const { show } = useToast()

  const [card, setCard] = useState<Card | null>(null)
  const [failed, setFailed] = useState(false)
  const [condition, setCondition] = useState<Condition>('near_mint')

  const load = () => {
    setFailed(false)
    api.card(cardId, language).then(setCard).catch(() => setFailed(true))
  }
  useEffect(load, [cardId, language])

  if (failed) return <Screen><div className="pt-16"><ErrorState onRetry={load} /></div></Screen>
  if (!card) return <Spinner />

  const owned = ownedOf(card.id, language)
  const src = imageUrl(card)

  const addCard = async () => {
    await add({ id: card.id, language }, condition)
    show(`${card.name} ajoutée`, () => {
      const now = ownedOf(card.id, language)
      if (now) setQuantity(card.id, language, now.quantity - 1)
    })
  }

  return (
    <Screen>
      <header className="flex items-center gap-2 px-3 pt-4">
        <button
          onClick={() => navigate(-1)}
          aria-label="Revenir"
          className="flex size-11 items-center justify-center rounded-full text-foam-dim"
        >
          <ChevronLeftIcon className="size-6" />
        </button>
        <p className="voice-label truncate">{card.pack_name}</p>
      </header>

      {src && (
        <img
          src={src}
          alt={card.name}
          className="mx-auto mt-3 w-[min(74%,300px)] rounded-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)]"
        />
      )}

      <div className="flex items-start gap-3 px-5 pt-6">
        <ColorSpine colors={card.colors} className="mt-1.5 h-11" />
        <div className="min-w-0">
          <h1 className="voice-display text-2xl">{card.name}</h1>
          <p className="voice-data pt-1 text-sm text-foam-faint">
            {card.id} · {card.rarity} · {card.category}
          </p>
        </div>
      </div>

      <dl className="mx-5 mt-5 grid grid-cols-3 gap-2">
        <Stat label="Coût" value={card.cost} />
        <Stat label="Puissance" value={card.power} />
        <Stat label="Contre" value={card.counter} />
      </dl>

      {(card.effect || card.trigger) && (
        <div className="mx-5 mt-4 space-y-3 rounded-(--radius-card) bg-sea-raised p-4">
          {card.effect && (
            <p className="text-[0.94rem] leading-relaxed whitespace-pre-line">{card.effect}</p>
          )}
          {card.trigger && (
            <p className="text-[0.94rem] leading-relaxed whitespace-pre-line text-foam-dim">
              <span className="voice-label text-gold">Trigger</span> {card.trigger}
            </p>
          )}
        </div>
      )}

      {card.types.length > 0 && (
        <p className="px-5 pt-3 text-sm text-foam-dim">{card.types.join(' / ')}</p>
      )}

      {card.printings.length > 0 && (
        <section className="pt-7">
          <p className="voice-label px-5 pb-2">Autres tirages</p>
          <p className="px-5 pb-3 text-sm text-foam-dim">
            Même illustration et même code imprimé. Choisis celui que tu possèdes — rien
            ne permet de les distinguer automatiquement.
          </p>
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-5">
            {card.printings.map((id) => (
              <Link
                key={id}
                to={`/card/${encodeURIComponent(id)}?language=${language}`}
                className="voice-data min-h-10 shrink-0 rounded-full bg-sea-raised px-3.5 leading-10 text-sm"
              >
                {id}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mx-5 mt-7 rounded-(--radius-card) bg-sea-raised p-4">
        {owned ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Dans ta collection</p>
              {owned.condition && (
                <p className="text-sm text-foam-dim">{CONDITION_LABELS[owned.condition]}</p>
              )}
            </div>
            <Stepper
              value={owned.quantity}
              onChange={(next) => setQuantity(card.id, language, next)}
            />
          </div>
        ) : (
          <>
            <label className="block">
              <span className="voice-label">État</span>
              <select
                value={condition}
                onChange={(event) => setCondition(event.target.value as Condition)}
                className="mt-2 min-h-12 w-full rounded-xl bg-sea-high px-3 text-foam outline-none"
              >
                {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4">
              <Button size="lg" full onClick={addCard}>
                Ajouter à la collection
              </Button>
            </div>
          </>
        )}
      </section>
    </Screen>
  )
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl bg-sea-raised p-3 text-center">
      <dt className="voice-label">{label}</dt>
      <dd className="voice-data mt-1 text-lg font-bold">{value ?? '—'}</dd>
    </div>
  )
}
