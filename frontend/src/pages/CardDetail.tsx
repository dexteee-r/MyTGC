import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Edition, variantOf } from '../components/Edition'
import { ChevronLeftIcon } from '../components/icons'
import { PriceChart } from '../components/PriceChart'
import { Button, ColorBar, ErrorState, Screen, Spinner, Stepper } from '../components/ui'
import { api, imageUrl } from '../lib/api'
import { useCollection } from '../lib/collection'
import { money } from '../lib/money'
import { useToast } from '../lib/toast'
import {
  CONDITION_LABELS,
  type Card,
  type Condition,
  type Language,
  type PricePoint,
  type WishlistEntry,
} from '../lib/types'

export function CardDetail() {
  const { cardId = '' } = useParams()
  const [params] = useSearchParams()
  const language = (params.get('language') ?? 'en') as Language
  const navigate = useNavigate()
  const { ownedOf, add, setQuantity, setPrice, setCondition: saveCondition } = useCollection()
  const { show } = useToast()

  const [card, setCard] = useState<Card | null>(null)
  const [failed, setFailed] = useState(false)
  const [condition, setCondition] = useState<Condition>('near_mint')
  const [wanted, setWanted] = useState<WishlistEntry | null>(null)
  const [editingPrice, setEditingPrice] = useState(false)
  const [priceDraft, setPriceDraft] = useState('')
  const [history, setHistory] = useState<PricePoint[]>([])

  const load = useCallback(() => {
    setFailed(false)
    api.card(cardId, language).then(setCard).catch(() => setFailed(true))
    api
      .wishlist()
      .then((list) =>
        setWanted(list.find((e) => e.card_id === cardId && e.language === language) ?? null),
      )
      .catch(() => {})
    // Its own request, its own failure: a card with no priced history yet is not an
    // error, and the section simply stays empty rather than dragging the rest of the
    // sheet into a retry screen for a chart nobody would see anyway.
    setHistory([])
    api.priceHistory(cardId, language).then(setHistory).catch(() => {})
  }, [cardId, language])
  useEffect(load, [load])

  if (failed) return <Screen><div className="pt-14"><ErrorState onRetry={load} /></div></Screen>
  if (!card) return <Spinner />

  const owned = ownedOf(card.id, language)
  const src = imageUrl(card)

  /* One control for the whole holding, whether or not there is one yet. Going from
     nothing to one copy is the same gesture as going from one to two — it was a
     dropdown and a submit button, which made the commonest action on the screen the
     heaviest. The condition picker moves under it and only appears once something is
     held, because there is nothing to describe the state of until then. */
  const setCount = async (next: number) => {
    if (next < 0) return
    if (!owned) {
      await add({ id: card.id, language }, condition)
      show(`${card.name} rangée`, () => {
        const now = ownedOf(card.id, language)
        if (now) setQuantity(card.id, language, now.quantity - 1)
      })
      return
    }
    setQuantity(card.id, language, next)
  }

  const commitPrice = () => {
    setEditingPrice(false)
    if (!card) return
    const parsed = priceDraft.trim() === '' ? null : Number(priceDraft.replace(',', '.'))
    const price = parsed != null && Number.isFinite(parsed) && parsed >= 0 ? parsed : null
    setPrice(card.id, language, price)
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
      {/* The set name used to sit here. It is a fact about the card, not a place to
          go back to, and it now reads in the list at the foot with the others. */}
      <header className="px-3 pt-4">
        <button
          onClick={() => navigate(-1)}
          className="t-code flex min-h-[var(--touch)] items-center gap-2 px-2 text-[var(--text-secondary)]"
        >
          <ChevronLeftIcon className="size-4" />
          Retour
        </button>
      </header>

      {/* You came here to look at the card, so the card is the screen. Whole, at the
          width it can carry, watermark included — cropping it would be lying about
          what the material is. Held it is lit; not held it sits back in the water. */}
      <div className="relative isolate mx-auto mt-2 w-[min(72%,260px)]">
        {/* The rarest card in the game gets a light of its own, and only here — on
            a grid of 9,447 tiles it would be noise. */}
        {card.rarity === 'SecretRare' && <span aria-hidden className="rare-halo" />}
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

        {/* What it goes for, directly under what it is — the second thing you want to
            know about a card, so it is not buried in the list at the foot. When there
            is no figure the screen says why: silence here reads as a broken feature,
            which is exactly how it was read. */}
        <div className="pt-5">
          {card.market_price != null ? (
            <>
              <p className="t-numeral text-[1.5rem] leading-none">
                {money(card.market_price)}
              </p>
              <p className="t-code pt-1.5 text-[var(--text-faint)]">
                cote indicative · marché US
              </p>
            </>
          ) : (
            <p className="t-code text-[var(--text-faint)]">
              {language === 'jp' ? 'Pas de cote en édition japonaise' : 'Tirage non coté'}
            </p>
          )}
        </div>
      </div>

      {history.length >= 2 && (
        <div className="px-5 pt-6">
          <PriceChart points={history} />
        </div>
      )}

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
        {/* The one control in large type. It is the gesture a collector repeats more
            than any other, and it reads the same at nought as at nine. */}
        <div className="flex justify-center">
          <Stepper
            big
            value={owned?.quantity ?? 0}
            unit={(owned?.quantity ?? 0) > 1 ? 'exemplaires' : 'exemplaire'}
            onChange={setCount}
          />
        </div>

        {owned && (
          <>
            <label className="mt-6 block">
              <span className="t-eyebrow">État</span>
              <select
                value={owned.condition ?? condition}
                onChange={(event) => {
                  const next = event.target.value as Condition
                  setCondition(next)
                  saveCondition(card.id, language, next)
                }}
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

            {/* Typed in by hand, like the wishlist's bounty: the feed prices the
                market, not what you paid, so a number here means someone paid it. */}
            <div className="mt-4 flex justify-center">
              {editingPrice ? (
                <input
                  autoFocus
                  inputMode="decimal"
                  value={priceDraft}
                  onChange={(event) => setPriceDraft(event.target.value)}
                  onBlur={commitPrice}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitPrice()
                    if (event.key === 'Escape') setEditingPrice(false)
                  }}
                  aria-label="Prix d'achat, en euros"
                  className="t-code w-28 rounded-full px-4 py-2 text-center outline-none"
                  style={{ background: 'var(--surface-recessed)' }}
                />
              ) : (
                <button
                  onClick={() => {
                    setPriceDraft(owned.acquisitionPrice != null ? String(owned.acquisitionPrice) : '')
                    setEditingPrice(true)
                  }}
                  className="t-code min-h-[var(--touch)] px-4 text-[var(--text-secondary)] underline underline-offset-4"
                >
                  {owned.acquisitionPrice == null
                    ? "Noter le prix d'achat"
                    : `Payée ${owned.acquisitionPrice.toLocaleString('fr', {
                        minimumFractionDigits: Number.isInteger(owned.acquisitionPrice) ? 0 : 2,
                        maximumFractionDigits: 2,
                      })} €`}
                </button>
              )}
            </div>
          </>
        )}

        {/* Lit while it is on the list: this is a state as much as a button, and the
            poster screen it feeds is the loudest surface in the app. */}
        <div className="mt-6">
          <Button variant={wanted ? 'primary' : 'quiet'} full onClick={toggleWanted}>
            {wanted ? 'Retirer des recherchées' : 'Mettre dans les recherchées'}
          </Button>
        </div>
      </section>

      {/* The facts, in rows separated by a hairline. A card without a power exists —
          an Event, a Stage — so an absent value shows a dash and never a zero. */}
      <dl className="mt-8 px-5">
        <Fact label="Extension" value={card.pack_name ?? card.pack_code} />
        <Fact label="Couleur" value={card.colors.join(' / ')} />
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
