import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Edition, variantOf } from '../components/Edition'
import { GroupPicker } from '../components/GroupPicker'
import { ChevronLeftIcon, ChevronRightIcon } from '../components/icons'
import { PriceChart } from '../components/PriceChart'
import {
  Button,
  ColorBar,
  ErrorState,
  OverlayBackdrop,
  Screen,
  Spinner,
  Stepper,
  useOverlayBehavior,
} from '../components/ui'
import { api, imageUrl } from '../lib/api'
import { useCollection } from '../lib/collection'
import { money } from '../lib/money'
import { useToast } from '../lib/toast'
import { CONDITION_LABELS, type Card, type Condition, type Language, type PricePoint } from '../lib/types'
import { useWishlist } from '../lib/wishlist'

export function CardDetail() {
  const { cardId = '' } = useParams()
  const [params] = useSearchParams()
  const language = (params.get('language') ?? 'en') as Language
  const navigate = useNavigate()
  const location = useLocation()

  /* How many arrow-hops separate this card from wherever the person actually
     came from (Recherchées, Collection, a search result, ...). Carried forward
     in router state on every hop rather than kept in a ref or useState: this
     whole route remounts on every card-to-card navigation (`<main
     key={pathname}>` in Shell), which would otherwise reset any local counter
     back to zero on the very next hop. Absent state reads as zero -- the first
     arrival at a card, before any hop has happened yet. */
  const hops = (location.state as { hops?: number } | null)?.hops ?? 0

  /* One target for both buttons and the arrow keys, so the two can never drift
     apart on where a hop actually lands or how it is counted. */
  const goToCard = (target: { card_id: string; language: Language }) => {
    navigate(
      `/card/${encodeURIComponent(target.card_id)}?language=${target.language}`,
      { state: { hops: hops + 1 } },
    )
  }
  const {
    entries,
    ownedOf,
    add,
    setQuantity,
    setPrice,
    setCondition: saveCondition,
    setNotes: saveNotes,
    setDateAdded,
  } = useCollection()
  const { wantedOf, add: addToWishlist, remove: removeFromWishlist } = useWishlist()
  const { show } = useToast()

  const [card, setCard] = useState<Card | null>(null)
  const [failed, setFailed] = useState(false)
  const [condition, setCondition] = useState<Condition>('near_mint')
  const [editingPrice, setEditingPrice] = useState(false)
  const [priceDraft, setPriceDraft] = useState('')
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [editingDate, setEditingDate] = useState(false)
  const [history, setHistory] = useState<PricePoint[]>([])
  const [groupPickerOpen, setGroupPickerOpen] = useState(false)

  const [lightboxOpen, setLightboxOpen] = useState(false)

  const load = useCallback(() => {
    setFailed(false)
    api.card(cardId, language).then(setCard).catch(() => setFailed(true))
    // Its own request, its own failure: a card with no priced history yet is not an
    // error, and the section simply stays empty rather than dragging the rest of the
    // sheet into a retry screen for a chart nobody would see anyway.
    setHistory([])
    api.priceHistory(cardId, language).then(setHistory).catch(() => {})
  }, [cardId, language])
  useEffect(load, [load])

  /* Previous/next step through the collection itself, not the catalogue — the
     collection is already held in full for the session (see collection.tsx), in
     the same date_added-DESC order the Collection screen shows by default, so
     finding this card's neighbours costs nothing further to fetch. A card not in
     the collection has no position in that list to step from, so it gets no
     buttons rather than a pair that would silently fall back to some other
     order the person never asked for. Matched on the route's own cardId rather
     than `card.id`: hooks cannot follow the early "still loading" return below,
     so this has to stand on values available from the very first render. */
  const positionInCollection = entries.findIndex(
    (entry) => entry.card_id === cardId && entry.language === language,
  )
  const previousInCollection = positionInCollection > 0
    ? entries[positionInCollection - 1] : null
  const nextInCollection = positionInCollection !== -1
    && positionInCollection < entries.length - 1
    ? entries[positionInCollection + 1] : null

  /* The arrow keys mirror the two buttons exactly rather than adding a second
     way to move that could drift from the first — same targets, same absence at
     either end of the list. Ignored while a form field owns the keystroke: the
     État <select> already reads its own left/right, and a text cursor moving
     through a note or a price should never be hijacked into leaving the page. */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT'
        || target.isContentEditable
      )) {
        return
      }
      if (event.key === 'ArrowLeft' && previousInCollection) {
        goToCard(previousInCollection)
      } else if (event.key === 'ArrowRight' && nextInCollection) {
        goToCard(nextInCollection)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previousInCollection, nextInCollection, hops])

  if (failed) return <Screen><div className="pt-14"><ErrorState onRetry={load} /></div></Screen>
  if (!card) return <Spinner />

  const owned = ownedOf(card.id, language)
  const wanted = wantedOf(card.id, language)
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

  const commitNotes = () => {
    setEditingNotes(false)
    if (!card) return
    const trimmed = notesDraft.trim()
    saveNotes(card.id, language, trimmed === '' ? null : trimmed)
  }

  const commitDate = async (value: string) => {
    setEditingDate(false)
    if (!card || !value) return
    try {
      await setDateAdded(card.id, language, value)
    } catch {
      // The only realistic rejection here is a future date, and the input's own
      // max already keeps the picker from offering one — this is the fallback for
      // whatever gets past that (a device clock behind the server's, mainly).
      show("Cette date n'a pas été acceptée.")
    }
  }

  const toggleWanted = async () => {
    if (wanted) {
      await removeFromWishlist(wanted.id)
    } else {
      await addToWishlist({ id: card.id, language })
        .then(() => show(`${card.name} ajoutée aux recherchées`))
        .catch(() => show("Échec de l'ajout"))
    }
  }

  const addToGroup = async (groupId: number) => {
    setGroupPickerOpen(false)
    if (!owned) return
    try {
      await api.addToGroup(groupId, [owned.entryId])
      show(`${card.name} ajoutée au groupe`)
    } catch {
      show("L'ajout au groupe n'a pas abouti.")
    }
  }

  return (
    <Screen>
      {/* Pinned to the viewport rather than the scroll — the whole point is to stay
          reachable while the sheet underneath is however long this card's own text
          runs. Portalled to <body> rather than left in place: `<main>` carries the
          route's own `hz-enter` entrance animation, which for its ~400ms holds a
          non-none `transform` — and a `transform` anywhere in an element's
          ancestry turns `position: fixed` into "fixed to that ancestor" instead of
          to the viewport, per spec. Left in place, these buttons would render
          offset for as long as the animation runs and then visibly jump into their
          real position once it ended. Escaping to <body> sidesteps the whole
          question of what does or does not animate above this page.
          Absent rather than disabled at either edge of the collection, or on a
          card that isn't in it at all: a lit control with nothing behind it
          reads as a bug the first time it is tapped. */}
      {createPortal(
        <>
          {previousInCollection && (
            <button
              onClick={() => goToCard(previousInCollection)}
              aria-label="Carte précédente de la collection"
              className="fixed top-1/2 left-2 z-20 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-[var(--color-paper-100)] lg:left-4"
              style={{ background: 'rgba(4,18,26,.72)' }}
            >
              <ChevronLeftIcon className="size-6" />
            </button>
          )}
          {nextInCollection && (
            <button
              onClick={() => goToCard(nextInCollection)}
              aria-label="Carte suivante de la collection"
              className="fixed top-1/2 right-2 z-20 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-[var(--color-paper-100)] lg:right-4"
              style={{ background: 'rgba(4,18,26,.72)' }}
            >
              <ChevronRightIcon className="size-6" />
            </button>
          )}
        </>,
        document.body,
      )}

      {/* The set name used to sit here. It is a fact about the card, not a place to
          go back to, and it now reads in the list at the foot with the others. */}
      <header className="px-3 pt-4">
        {/* history.back() after all, but for as many steps as this card is deep
            into a run of arrow-hops -- `hops` counts exactly that. Zero hops (the
            ordinary case: arrived straight from Recherchées, Collection, a
            search result, wherever) is history.back() unchanged, landing back on
            that same screen. A run of hops skips every intermediate card in one
            jump instead of surfacing them one "Retour" tap at a time, which is
            the one thing a bare history.back() got wrong here. */}
        <button
          onClick={() => navigate(-(hops + 1))}
          className="t-code flex min-h-[var(--touch)] items-center gap-2 px-2 text-[var(--text-secondary)]"
        >
          <ChevronLeftIcon className="size-4" />
          Retour
        </button>
      </header>

      {/* Stacked on a phone, side by side from `lg:` up — the card on the left, large,
          everything about it on the right. The image is already first in the DOM
          (the mobile reading order, and what a screen reader meets first), so on
          desktop it simply lands in the grid's first column with no `order` needed. */}
      <div className="lg:grid lg:grid-cols-[460px_1fr] lg:items-start lg:gap-12 lg:px-8 lg:pt-2">
        {/* You came here to look at the card, so the card is the screen. Whole, at the
            width it can carry, watermark included — cropping it would be lying about
            what the material is. Held it is lit; not held it sits back in the water.
            Sticky on desktop: the details column can run long (chart, effect text,
            the facts list), and the one thing every one of those sections is about
            should not scroll out of view while they do. */}
        <div className="relative isolate mx-auto mt-2 w-[min(80%,320px)] lg:sticky lg:top-6 lg:mx-0 lg:mt-0 lg:w-[460px]">
          {/* The rarest card in the game gets a light of its own, and only here — on
              a grid of 9,447 tiles it would be noise. */}
          {card.rarity === 'SecretRare' && <span aria-hidden className="rare-halo" />}
          {src ? (
            /* Step one is this tap: open the art full-bleed. The zoom-on-hover
               lives inside CardLightbox, on the enlarged image, not here --
               hovering a 320px-wide thumbnail to magnify it further makes little
               sense next to a plain click that already shows the same art much
               bigger. */
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              aria-label={`Agrandir ${card.name}`}
              className={`block w-full cursor-zoom-in ${owned ? 'float-lit' : 'float'}`}
            >
              <img
                src={src}
                alt={card.name}
                decoding="async"
                className={`w-full ${owned ? '' : 'opacity-55 saturate-[.85]'}`}
              />
            </button>
          ) : (
            <div className="sunken aspect-[600/838] w-full" />
          )}

          {/* Right under the card rather than lower in the details flow, and no
              longer `big`: what the card screen used to open with (the one control
              a collector repeats more than any other) reads better as small and
              close to what it counts than as a headline of its own. Living inside
              this same sticky box, it travels with the card rather than the text. */}
          <div className="mt-3 flex justify-center">
            <Stepper
              value={owned?.quantity ?? 0}
              onChange={setCount}
            />
          </div>

          {/* The facts, in rows separated by a hairline. A card without a power
              exists — an Event, a Stage — so an absent value shows a dash and never
              a zero. Grouped with the card itself rather than left in the details
              flow: these describe the card everyone's copy shares (its extension,
              its colour, its stats), never the one held here — that half stays on
              the right, next to État and the rest of what is specific to it. */}
          <dl className="mt-6">
            <Fact label="Extension" value={card.pack_name ?? card.pack_code} />
            <Fact label="Couleur" value={card.colors.join(' / ')} />
            <Fact label="Catégorie" value={card.category} />
            <Fact label="Coût" value={card.cost} />
            <Fact label="Puissance" value={card.power} />
            <Fact label="Contre" value={card.counter} />
            {card.types.length > 0 && <Fact label="Types" value={card.types.join(' / ')} />}
          </dl>
        </div>

        <div>
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

            {/* What it goes for, directly under what it is — the second thing you want
                to know about a card, so it is not buried in the list at the foot. When
                there is no figure the screen says why: silence here reads as a broken
                feature, which is exactly how it was read. */}
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
                <p className="text-[0.94rem] leading-relaxed whitespace-pre-line">
                  {card.effect}
                </p>
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
                Même illustration et même code imprimé. Choisis celui que tu possèdes —
                rien ne permet de les distinguer automatiquement.
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
            {owned && (
              <>
                {/* The same ring the goal card on the Classeur uses to say "this one
                    matters" — a border, not a new colour, so it stays inside the
                    palette the rest of the sheet already draws from. Everything
                    below it (price, date, note) stays a plain pill; État is the one
                    fact about a held copy that changes what it can be traded or sold
                    for, so it is the one that gets to look like it. */}
                <div
                  className="rounded-[14px] p-4"
                  style={{ boxShadow: 'inset 0 0 0 1px var(--surface-rail)' }}
                >
                  <label className="block">
                    <span className="t-eyebrow">État</span>
                    <select
                      value={owned.condition ?? condition}
                      onChange={(event) => {
                        const next = event.target.value as Condition
                        setCondition(next)
                        saveCondition(card.id, language, next)
                      }}
                      className="mt-2 min-h-[var(--touch)] w-full rounded-full px-4 text-[1.05rem] font-semibold text-[var(--text-primary)] outline-none"
                      style={{ background: 'var(--surface-recessed)' }}
                    >
                      {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

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
                        setPriceDraft(
                          owned.acquisitionPrice != null ? String(owned.acquisitionPrice) : '',
                        )
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

                {/* When it entered the binder, corrected after the fact — the server
                    stamps today's date automatically on add, and this is the only way
                    to fix it once it turns out to be wrong. */}
                <div className="mt-4 flex justify-center">
                  {editingDate ? (
                    <input
                      autoFocus
                      type="date"
                      defaultValue={owned.dateAdded}
                      max={new Date().toISOString().slice(0, 10)}
                      onBlur={(event) => commitDate(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setEditingDate(false)
                      }}
                      aria-label="Date d'ajout à la collection"
                      className="t-code rounded-full px-4 py-2 text-center outline-none"
                      style={{ background: 'var(--surface-recessed)' }}
                    />
                  ) : (
                    <button
                      onClick={() => setEditingDate(true)}
                      className="t-code min-h-[var(--touch)] px-4 text-[var(--text-secondary)] underline underline-offset-4"
                    >
                      Ajoutée le{' '}
                      {new Date(`${owned.dateAdded}T00:00:00`).toLocaleDateString('fr', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </button>
                  )}
                </div>

                {/* Free text about this specific copy — "signée", "achetée à Paris" —
                    not about the card, which every account shares. Boxed like a
                    comment field rather than styled as the underlined single-line
                    buttons price and date use above it: those hold one value each, a
                    note is prose, and looking the part before it is even clicked says
                    so before the person has to read the label. Closed and open share
                    the same box (rounded-2xl, recessed) so opening it never jumps. */}
                <div className="mt-4">
                  {editingNotes ? (
                    <textarea
                      autoFocus
                      rows={2}
                      maxLength={280}
                      value={notesDraft}
                      onChange={(event) => setNotesDraft(event.target.value)}
                      onBlur={commitNotes}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setEditingNotes(false)
                      }}
                      aria-label="Note sur cet exemplaire"
                      className="w-full resize-none rounded-2xl px-4 py-3 text-sm outline-none"
                      style={{ background: 'var(--surface-recessed)' }}
                    />
                  ) : (
                    <button
                      onClick={() => {
                        setNotesDraft(owned.notes ?? '')
                        setEditingNotes(true)
                      }}
                      className={`block min-h-[3.75rem] w-full rounded-2xl px-4 py-3 text-left leading-relaxed outline-none ${
                        owned.notes ? 'text-sm text-[var(--text-secondary)]' : 't-code text-[var(--text-faint)]'
                      }`}
                      style={{ background: 'var(--surface-recessed)' }}
                    >
                      {/* Free text is never worn as t-code: that class uppercases, and
                          a note the person actually typed is not a value to reformat,
                          the way the placeholder prompt above it is. */}
                      {owned.notes ? owned.notes : 'Ajouter une note'}
                    </button>
                  )}
                </div>

                {/* A folder this specific holding belongs to -- "même dessinateur",
                    "même style d'illustration", whatever a collector decides. Manual
                    by design: nothing in the catalogue supports this automatically. */}
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => setGroupPickerOpen(true)}
                    className="t-code min-h-[var(--touch)] px-4 text-[var(--text-secondary)] underline underline-offset-4"
                  >
                    Ajouter à un groupe
                  </button>
                </div>
              </>
            )}

            {/* Lit while it is on the list: this is a state as much as a button, and
                the poster screen it feeds is the loudest surface in the app. */}
            <div className="mt-6">
              <Button variant={wanted ? 'primary' : 'quiet'} full onClick={toggleWanted}>
                {wanted ? 'Retirer des recherchées' : 'Mettre dans les recherchées'}
              </Button>
            </div>
          </section>
        </div>
      </div>

      <GroupPicker
        open={groupPickerOpen}
        onClose={() => setGroupPickerOpen(false)}
        onPick={addToGroup}
      />

      {src && (
        <CardLightbox open={lightboxOpen} onClose={() => setLightboxOpen(false)} src={src} alt={card.name} />
      )}
    </Screen>
  )
}

/* Full-bleed, not Dialog's padded card: the point is to look at the art, not to
   read a title bar around it. Portalled for the same reason the prev/next
   collection-hop buttons already are (see the comment above them) -- <main>
   carries a transform during its own entrance animation, and position: fixed
   inside a transformed ancestor is fixed to that ancestor, not the viewport. */
function CardLightbox({
  open, onClose, src, alt,
}: {
  open: boolean
  onClose: () => void
  src: string
  alt: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  useOverlayBehavior(open, onClose, containerRef)

  // Local to the lightbox, not lifted to CardDetail: it fully unmounts on close
  // (the `if (!open) return null` below), so there is no stale zoom left over
  // from a previous time it was opened to reset by hand.
  const imgRef = useRef<HTMLImageElement>(null)
  const [zoomed, setZoomed] = useState(false)

  if (!open) return null

  // Step two of the workflow: once the art is already enlarged, the point under
  // the cursor stays put while the rest scales around it, tracked on every
  // mousemove via transform-origin.
  const onMouseMove = (event: React.MouseEvent<HTMLElement>) => {
    const img = imgRef.current
    if (!img) return
    const rect = event.currentTarget.getBoundingClientRect()
    img.style.transformOrigin =
      `${((event.clientX - rect.left) / rect.width) * 100}% ` +
      `${((event.clientY - rect.top) / rect.height) * 100}%`
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <OverlayBackdrop onClose={onClose} />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={alt}
        tabIndex={-1}
        className="hz-enter relative flex max-h-[95vh] max-w-[min(95vw,820px)] flex-col items-end gap-2 outline-none"
      >
        <button
          onClick={onClose}
          className="t-code min-h-[var(--touch)] px-3"
          style={{ color: 'var(--color-paper-100)' }}
        >
          Fermer
        </button>
        {/* overflow-hidden lives on this wrapper, not the image itself -- the
            wrapper's box stays put at the image's unscaled size, so a `scale()`
            transform on the image inside it clips at that boundary instead of
            spilling out of the lightbox. Touch devices never fire the mouse
            events driving this, so a phone just sees the plain enlarged art. */}
        <div
          className="overflow-hidden rounded-[2px]"
          style={{ boxShadow: 'var(--shadow-deck)' }}
          onMouseEnter={() => setZoomed(true)}
          onMouseLeave={() => setZoomed(false)}
          onMouseMove={onMouseMove}
        >
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            className={`max-h-[88vh] w-auto cursor-zoom-in transition-transform duration-150 ease-out ${
              zoomed ? 'scale-[2.2]' : 'scale-100'
            }`}
          />
        </div>
      </div>
    </div>,
    document.body,
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
