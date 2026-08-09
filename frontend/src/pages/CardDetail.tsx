import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Edition } from '../components/Edition'
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

      {/* Seated in its pocket, or the pocket it would go in. */}
      <div className="mx-auto mt-3 w-[min(86%,340px)]">
        {owned && src ? (
          <img src={src} alt={card.name} className="float w-full" />
        ) : src ? (
          <img src={src} alt={card.name} className="float w-full opacity-45 saturate-50" />
        ) : (
          <div className="sunken aspect-[600/838] w-full" />
        )}
      </div>

      <div className="flex items-start gap-3 px-4 pt-6">
        <ColorBar colors={card.colors} className="mt-1 h-10 w-[3px]" />
        <div className="min-w-0">
          <h1 className="t-numeral text-2xl">{card.name}</h1>
          <p className="t-code pt-2">
            {card.id} · {card.rarity} · {card.category} · <Edition language={language} />
          </p>
        </div>
      </div>

      {/* The card's own stat block, in the card's own idiom. */}
      <dl className="mt-5 grid grid-cols-3 wall gap-px">
        <Stat label="Coût" value={card.cost} />
        <Stat label="Puissance" value={card.power} />
        <Stat label="Contre" value={card.counter} />
      </dl>

      {(card.effect || card.trigger) && (
        <div className="space-y-3 px-4 pt-5">
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

      {card.types.length > 0 && (
        <p className="px-4 pt-3 text-sm text-[var(--text-secondary)]">{card.types.join(' / ')}</p>
      )}

      {card.printings.length > 0 && (
        <section className="pt-7">
          <p className="t-code px-4 pb-2">Autres tirages</p>
          <p className="px-4 pb-3 text-sm text-[var(--text-secondary)]">
            Même illustration et même code imprimé. Choisis celui que tu possèdes — rien
            ne permet de les distinguer automatiquement.
          </p>
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4">
            {card.printings.map((id) => (
              <Link
                key={id}
                to={`/card/${encodeURIComponent(id)}?language=${language}`}
                className="t-code sunken min-h-10 shrink-0 px-3 leading-10"
              >
                {id}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8 border-b border-[rgba(243,230,203,.12)] px-4 pt-5">
        {owned ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="t-plate">Dans ta collection</p>
              {owned.condition && (
                <p className="t-code pt-1">{CONDITION_LABELS[owned.condition]}</p>
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
              <span className="t-code">État</span>
              <select
                value={condition}
                onChange={(event) => setCondition(event.target.value as Condition)}
                className="sunken mt-2 min-h-12 w-full px-3 text-[var(--text-primary)] outline-none"
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

        <div className="mt-3 pb-2">
          <Button variant={wanted ? 'quiet' : 'ghost'} full onClick={toggleWanted}>
            {wanted ? 'Retirer des recherchées' : 'Marquer comme recherchée'}
          </Button>
        </div>
      </section>
    </Screen>
  )
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="bg-sea-900 px-3 py-3.5 text-center">
      <dt className="t-code">{label}</dt>
      <dd className="t-numeral pt-1.5 text-xl">{value ?? '—'}</dd>
    </div>
  )
}
