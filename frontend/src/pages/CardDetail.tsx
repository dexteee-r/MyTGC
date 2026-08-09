import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Edition, variantOf } from '../components/Edition'
import { ChevronLeftIcon } from '../components/icons'
import { Button, ColorBar, ErrorState, Screen, Spinner, Stepper } from '../components/ui'
import { api, imageUrl } from '../lib/api'
import { useCollection } from '../lib/collection'
import { useToast } from '../lib/toast'
import {
  CONDITION_LABELS,
  type Card,
  type Condition,
  type Language,
  type WishlistEntry,
} from '../lib/types'

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
  const [wanted, setWanted] = useState<WishlistEntry | null>(null)

  const load = useCallback(() => {
    setFailed(false)
    api.card(cardId, language).then(setCard).catch(() => setFailed(true))
    api
      .wishlist()
      .then((list) =>
        setWanted(list.find((e) => e.card_id === cardId && e.language === language) ?? null),
      )
      .catch(() => {})
  }, [cardId, language])
  useEffect(load, [load])

  if (failed) return <Screen><div className="pt-14"><ErrorState onRetry={load} /></div></Screen>
  if (!card) return <Spinner />

  const owned = ownedOf(card.id, language)
  const src = imageUrl(card)

  const addCard = async () => {
    await add({ id: card.id, language }, condition)
    show(`${card.name} rangée`, () => {
      const now = ownedOf(card.id, language)
      if (now) setQuantity(card.id, language, now.quantity - 1)
    })
  }

  const toggleWanted = async () => {
    if (wanted) {
      setWanted(null)
      await api.removeFromWishlist(wanted.id).catch(load)
    } else {
      const entry = await api
        .addToWishlist({ card_id: card.id, language })
        .catch(() => null)
      setWanted(entry)
      if (entry) show(`${card.name} ajoutée aux recherchées`)
    }
  }

  return (
    <Screen>
      <header className="flex items-center gap-1 px-2 pt-4">
        <button
          onClick={() => navigate(-1)}
          aria-label="Revenir"
          className="flex size-11 items-center justify-center text-[var(--text-secondary)]"
        >
          <ChevronLeftIcon className="size-5" />
        </button>
        <p className="t-code truncate">{card.pack_name}</p>
      </header>

      {/* You came here to look at the card, so the card is the screen. Whole, at the
          width it can carry, watermark included — cropping it would be lying about
          what the material is. Held it is lit; not held it sits back in the water. */}
      <div className="mx-auto mt-2 w-[min(72%,260px)]">
        {src ? (
          <img
            src={src}
            alt={card.name}
            decoding="async"
            className={owned ? 'float-lit w-full' : 'float w-full opacity-55 saturate-[.85]'}
          />
        ) : (
          <div className="sunken aspect-[600/838] w-full" />
        )}
      </div>

      <div className="px-5 pt-6 text-center">
        <h1 className="t-display text-[2rem]">{card.name}</h1>
        <p className="t-code flex items-center justify-center gap-1.5 pt-2.5">
          {card.id} · {card.rarity}
          {variantOf(card.id) && <> · {variantOf(card.id)}</>} ·{' '}
          <Edition language={language} />
        </p>
        <div className="mt-3 flex justify-center">
          <ColorBar colors={card.colors} className="h-[3px] w-16" />
        </div>
      </div>

      {(card.effect || card.trigger) && (
        <div className="space-y-3 px-5 pt-6">
          {card.effect && (
            <p className="text-[0.94rem] leading-relaxed whitespace-pre-line">{card.effect}</p>
          )}
          {card.trigger && (
            <p className="text-[0.94rem] leading-relaxed whitespace-pre-line text-[var(--text-secondary)]">
              <span className="t-code">Trigger</span> {card.trigger}
            </p>
          )}
        </div>
      )}

      {card.printings.length > 0 && (
        <section className="pt-7">
          <p className="t-eyebrow px-5 pb-2">Autres tirages</p>
          <p className="px-5 pb-3 text-sm text-[var(--text-secondary)]">
            Même illustration et même code imprimé. Choisis celui que tu possèdes — rien
            ne permet de les distinguer automatiquement.
          </p>
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-5">
            {card.printings.map((id) => (
              <Link
                key={id}
                to={`/card/${encodeURIComponent(id)}?language=${language}`}
                className="t-code min-h-[var(--touch)] shrink-0 rounded-full px-4 leading-[2.75rem]"
                style={{ background: 'var(--surface-recessed)' }}
              >
                {id}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="px-5 pt-7">
        {owned ? (
          <>
            <p className="t-eyebrow pb-3 text-center">Dans ta collection</p>
            <div className="flex justify-center">
              <Stepper
                big
                value={owned.quantity}
                onChange={(next) => setQuantity(card.id, language, next)}
              />
            </div>
            {owned.condition && (
              <p className="t-code pt-3 text-center">{CONDITION_LABELS[owned.condition]}</p>
            )}
          </>
        ) : (
          <>
            <label className="block">
              <span className="t-eyebrow">État</span>
              <select
                value={condition}
                onChange={(event) => setCondition(event.target.value as Condition)}
                className="mt-2 min-h-[var(--touch)] w-full rounded-full px-4 text-[var(--text-primary)] outline-none"
                style={{ background: 'var(--surface-recessed)' }}
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
                Ranger dans la collection
              </Button>
            </div>
          </>
        )}

        <div className="mt-4">
          <Button variant="quiet" full onClick={toggleWanted}>
            {wanted ? 'Retirer des recherchées' : 'Marquer comme recherchée'}
          </Button>
        </div>
      </section>

      {/* The facts, in rows separated by a hairline. A card without a power exists —
          an Event, a Stage — so an absent value shows a dash and never a zero. */}
      <dl className="mt-8 px-5">
        <Fact label="Extension" value={card.pack_name ?? card.pack_code} />
        <Fact label="Catégorie" value={card.category} />
        <Fact label="Coût" value={card.cost} />
        <Fact label="Puissance" value={card.power} />
        <Fact label="Contre" value={card.counter} />
        {card.types.length > 0 && <Fact label="Types" value={card.types.join(' / ')} />}
      </dl>
    </Screen>
  )
}

function Fact({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[rgba(243,230,203,.12)] py-3">
      <dt className="t-code shrink-0">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm">
        {value === null || value === undefined || value === '' ? (
          <span className="text-[var(--text-faint)]">—</span>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}
