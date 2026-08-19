import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Edition } from '../components/Edition'
import { InfoIcon, LinkIcon } from '../components/icons'
import { PriceChart } from '../components/PriceChart'
import { ShareDialog } from '../components/ShareDialog'
import {
  Button,
  Chip,
  Dialog,
  EmptyState,
  PageHeader,
  Screen,
  Segmented,
  Sheet,
  Sounding,
} from '../components/ui'
import { api, imageUrl } from '../lib/api'
import { useCollection } from '../lib/collection'
import { money } from '../lib/money'
import type { CollectionEntry, Language, ValuePoint } from '../lib/types'

type Sort =
  | 'date_desc'
  | 'date_asc'
  | 'set_asc'
  | 'set_desc'
  | 'price_asc'
  | 'price_desc'
  | 'rarity_asc'
  | 'rarity_desc'
  | 'doublon'
type View = 'all' | 'doubles'

/* The pile, not the card: quantity × market_price, the same total "Doubles" already
   uses to tell possédées from échangeables. A unit price would rank a lone 40 €
   card above a stack of three 15 € ones, which is not what "worth the most" means
   here. Unpriced sinks to the bottom either direction -- absence is not a low
   price. */
function pileValue(entry: CollectionEntry): number | null {
  const price = entry.card?.market_price
  return price == null ? null : entry.quantity * price
}

/* The game's own ladder (Common < Uncommon < Rare < SuperRare < SecretRare), decided
   over the app's own filter-chip order when the two disagreed. Leader, Promo, Special
   and TreasureRare sit outside that ladder entirely -- every deck holds exactly one
   Leader, and Promo spans free giveaways to tournament prizes -- so they are placed
   after SecretRare as the rarest tier rather than folded into the five-step scale,
   Treasure Rare last as the game's actual chase rarity. */
const RARITY_RANK: Record<string, number> = {
  Common: 0, Uncommon: 1, Rare: 2, SuperRare: 3, SecretRare: 4,
  Leader: 5, Promo: 6, Special: 7, TreasureRare: 8,
}

function rarityRank(entry: CollectionEntry): number | null {
  const rarity = entry.card?.rarity
  return rarity != null && rarity in RARITY_RANK ? RARITY_RANK[rarity] : null
}

/* The printed number, not the id string as a whole -- "OP01-010" has to land after
   "OP01-009", which a plain string compare would get wrong the moment a set passes
   nine cards. Variant suffixes (_p1, _r2) share their base card's number on purpose,
   the same printing rather than a different slot in the set. */
function cardNumber(entry: CollectionEntry): number {
  const match = entry.card_id.match(/-(\d+)/)
  return match ? parseInt(match[1], 10) : Number.POSITIVE_INFINITY
}

/* ── The plate ──────────────────────────────────────────────────────────────
   The collection as an object rather than as an inventory. A list row gives one card
   145px of screen to say a name and a number you already know; three across gives
   the same screen eight cards you can recognise, which is what looking at a
   collection is for.

   Whole cards, watermark included. The SAMPLE across the middle is a property of the
   material, not a defect to crop out, and it is the full portrait silhouette that
   makes a plate read as a page rather than as a row of tiles.                       */

export function Collection() {
  const { entries, stats, ready } = useCollection()
  const [sort, setSort] = useState<Sort>('date_desc')
  const [view, setView] = useState<View>('all')
  const [language, setLanguage] = useState<Language | null>(null)
  const [infoOpen, setInfoOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [valueHistory, setValueHistory] = useState<ValuePoint[]>([])

  // What is on, in words, for the trigger that opens the sheet -- same reasoning as
  // appliedLabels in Filters.tsx: a filter you cannot see from the closed button is
  // one you forget you set.
  const applied = [
    language === 'en' ? 'INT' : language === 'jp' ? 'JP' : null,
    view === 'doubles' ? 'Doubles' : null,
    // date_desc is the default -- newest first, same as before this sort had a
    // name of its own -- so only its opposite reads as a choice worth surfacing.
    sort === 'date_asc' ? "Date d'ajout -" : null,
    sort === 'set_asc' ? 'Extension croissante' : sort === 'set_desc' ? 'Extension décroissante' : null,
    sort === 'price_desc' ? 'Valeur décroissante' : sort === 'price_asc' ? 'Valeur croissante' : null,
    sort === 'rarity_desc' ? 'Plus rare' : sort === 'rarity_asc' ? 'Moins rare' : null,
    sort === 'doublon' ? "Doublons d'abord" : null,
  ].filter(Boolean) as string[]
  const resetFilters = () => {
    setView('all')
    setSort('date_desc')
    setLanguage(null)
  }

  // Its own request rather than folded into useCollection: every other screen that
  // context feeds has no use for a time series, and a failure here should leave the
  // rest of the page alone rather than blank the whole collection over a chart.
  useEffect(() => {
    api.collectionValueHistory().then(setValueHistory).catch(() => {})
  }, [])

  // Applied before Vue and before Trier: which language is on the table decides
  // what there is to view or sort in the first place. The header meta and the
  // "Valeur estimée" total under Tout stay account-wide regardless -- the same
  // choice already made for the Doubles view, which doesn't rescale them either.
  const languageFiltered = useMemo(
    () => (language ? entries.filter((entry) => entry.language === language) : entries),
    [entries, language],
  )

  /* What is worth trading: every card held more than once. The card you'd keep is
     never in this count — a stack of three shows two, because the base of a trade
     is what you can give away without emptying your own binder. */
  const doubles = useMemo(
    () => languageFiltered.filter((entry) => entry.quantity > 1),
    [languageFiltered],
  )

  /* Both figures the doubles view needs, computed here rather than on the server:
     the collection is already loaded whole for every screen, and this is the only
     place anyone asks for it — a stats endpoint for one number one screen reads
     would be a round trip to save a filter and a reduce. */
  const doublesValue = useMemo(() => {
    let held = 0
    let trade = 0
    let priced = 0
    for (const entry of doubles) {
      const price = entry.card?.market_price
      if (price == null) continue
      priced += 1
      held += entry.quantity * price
      trade += (entry.quantity - 1) * price
    }
    return { held, trade, priced }
  }, [doubles])

  const source = view === 'doubles' ? doubles : languageFiltered

  const isSet = sort === 'set_asc' || sort === 'set_desc'

  const groups = useMemo(() => {
    const sorted = [...source]
    if (sort === 'date_asc' || sort === 'date_desc') {
      // date_added is never null -- every entry carries the day it landed in the
      // binder -- so no absence case to push to the end here, unlike price/rareté.
      sorted.sort((a, b) =>
        sort === 'date_asc'
          ? a.date_added.localeCompare(b.date_added)
          : b.date_added.localeCompare(a.date_added),
      )
    } else if (isSet) {
      // Extension first, then the printed number within it -- and the same
      // direction flips both, the way flipping a real binder does: the last set
      // and its last card lead, not the first set with its numbers reversed.
      const dir = sort === 'set_asc' ? 1 : -1
      sorted.sort((a, b) => {
        const pa = a.card?.pack_code
        const pb = b.card?.pack_code
        if (pa == null) return pb == null ? 0 : 1
        if (pb == null) return -1
        const byPack = pa.localeCompare(pb) * dir
        return byPack !== 0 ? byPack : (cardNumber(a) - cardNumber(b)) * dir
      })
    } else if (sort === 'price_asc' || sort === 'price_desc') {
      sorted.sort((a, b) => {
        const va = pileValue(a)
        const vb = pileValue(b)
        if (va == null) return vb == null ? 0 : 1
        if (vb == null) return -1
        return sort === 'price_asc' ? va - vb : vb - va
      })
    } else if (sort === 'rarity_asc' || sort === 'rarity_desc') {
      sorted.sort((a, b) => {
        const ra = rarityRank(a)
        const rb = rarityRank(b)
        if (ra == null) return rb == null ? 0 : 1
        if (rb == null) return -1
        return sort === 'rarity_asc' ? ra - rb : rb - ra
      })
    } else if (sort === 'doublon') {
      // Highest stack first, not just a binary doubles-then-uniques split: a card
      // held five times is more of a double than one held twice, and quantity
      // descending already puts every quantity-1 entry last on its own -- no
      // separate tie-break needed to get "doublons d'abord" right.
      sorted.sort((a, b) => b.quantity - a.quantity)
    }
    if (!isSet) return [{ key: '', items: sorted }]

    const buckets = new Map<string, typeof sorted>()
    for (const entry of sorted) {
      const key = entry.card?.pack_code ?? 'Sans extension'
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key)!.push(entry)
    }
    return [...buckets].map(([key, items]) => ({ key, items }))
  }, [source, sort, isSet])

  if (!ready) return <div className="pt-10"><Sounding label="Ouverture du journal" /></div>

  return (
    <Screen className="scrollbar-desktop">
      <PageHeader
        title="Collection"
        meta={
          stats
            ? `${stats.total_quantity} cartes · ${stats.distinct_cards} références`
            : undefined
        }
        action={
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setShareOpen(true)}
              aria-label="Partager ma collection"
              className="flex size-11 items-center justify-center rounded-full text-[var(--text-secondary)]"
            >
              <LinkIcon className="size-5" />
            </button>
            <button
              onClick={() => setFiltersOpen(true)}
              aria-haspopup="dialog"
              aria-label={applied.length ? `Filtres actifs : ${applied.join(', ')}` : 'Filtres'}
              className="flex size-11 items-center justify-center rounded-full"
              style={{
                background: applied.length ? 'var(--gradient-sun)' : 'transparent',
                color: applied.length ? 'var(--color-paper-ink)' : 'var(--text-secondary)',
              }}
            >
              <FilterIcon className="size-[18px]" />
            </button>
            <button
              onClick={() => setInfoOpen(true)}
              aria-label="Comment fonctionne cette page"
              className="flex size-11 items-center justify-center rounded-full text-[var(--text-secondary)]"
            >
              <InfoIcon className="size-5" />
            </button>
          </div>
        }
      />

      {applied.length > 0 && (
        <div className="flex items-center gap-2 px-5 pb-2">
          <p className="t-code min-w-0 flex-1 truncate">{applied.join(' · ')}</p>
          <button onClick={resetFilters} className="t-code min-h-[var(--touch)] shrink-0 px-2">
            Tout effacer
          </button>
        </div>
      )}

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Partager ma collection"
        description="Un lien en lecture seule vers ce que tu possèdes — quantités et état inclus, jamais ce que tu as payé ni tes notes. N'importe qui avec ce lien peut le consulter, sans compte."
        fetchStatus={api.collectionShareStatus}
        enable={api.enableCollectionShare}
        disable={api.disableCollectionShare}
        publicPath={(token) => `/shared/collection/${token}`}
      />

      <Dialog open={infoOpen} onClose={() => setInfoOpen(false)} title="Comment ça marche">
        <div className="space-y-4 text-sm leading-relaxed text-[var(--text-secondary)]">
          <p>
            Chaque carte scannée ou ajoutée depuis sa fiche atterrit ici. Le médaillon{' '}
            <span className="t-numeral text-[0.8rem]" style={{ color: 'var(--text-primary)' }}>×3</span>{' '}
            dans le coin d'une carte n'apparaît que si tu en as plus d'un exemplaire —
            un « 1 » sur chaque carte serait du bruit sur un écran qui montre déjà ce
            que tu possèdes.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Édition</strong> restreint
            la liste à l'international, au japonais, ou aux deux. Le nombre de cartes en
            haut de page et la valeur estimée restent ceux de tout le classeur, quelle
            que soit l'édition choisie ici.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Tout / Doubles</strong> change
            quelles cartes sont listées. « Doubles » ne garde que celles possédées en
            plusieurs exemplaires, avec deux totaux distincts : <em>possédées</em> compte
            tout ce que tu en as, <em>échangeables</em> ne compte que le surplus — un
            exemplaire de chaque reste toujours dans ton classeur.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Trier</strong> ordonne la
            liste par date d'ajout, par extension puis numéro, par valeur —
            quantité × cote actuelle, pas le prix payé —, ou par rareté, sur
            l'échelle du jeu (Common à SecretRare, puis
            Leader/Promo/Special/TreasureRare comme le palier le plus rare) — dans
            les deux sens à chaque fois. « Doublons d'abord » met les piles les
            plus hautes en tête sans rien cacher, à la différence de la vue
            « Doubles » ci-dessus qui retire les exemplaires uniques de la liste.
            Une carte sans extension connue, non
            cotée, ou sans rareté connue reste toujours en fin de liste, quel que
            soit le sens. Ça ne change jamais quelles cartes sont affichées,
            seulement leur ordre.
          </p>
          <p>
            La <strong style={{ color: 'var(--text-primary)' }}>valeur estimée</strong> vient
            de tcgcsv (le marché américain, converti en euros au taux du jour), pas de
            Cardmarket. Elle ne couvre pas toutes les cartes — la ligne « X sur Y
            cotées » dit ce qui manque plutôt que de laisser un total partiel se lire
            comme une estimation complète.
          </p>
          <p>
            La courbe sous « Tout » retrace cette valeur au fil des relevés. Elle
            compte ce que tu possèdes aujourd'hui à chaque prix passé, seulement à
            partir du jour où tu l'as ajouté — jamais avant. Elle ne sait en revanche
            pas retirer une carte revendue ou une quantité baissée depuis : rien ne
            garde trace de ça.
          </p>
        </div>
      </Dialog>

      {entries.length === 0 ? (
        <div className="pt-8">
          <EmptyState
            title="Rien de rangé pour le moment"
            action={
              <Link to="/scan">
                <Button size="lg">Scanner une carte</Button>
              </Link>
            }
          >
            Scanne une carte, ou ajoute-la depuis sa fiche.
          </EmptyState>
        </div>
      ) : (
        <>
          {view === 'all' ? (
            /* What the shelf is worth, on the shelf itself. The log book carries the
               same figure beside what it cost and with the full caveat; here it is the
               headline only. The coverage line shows when part of the binder has no
               price — a total presented as if it covered everything is an appraisal,
               and this one never covers the Japanese cards. */
            stats && (
              <div className="flex items-baseline justify-between gap-4 px-5 pb-4">
                <div className="min-w-0">
                  <p className="t-code">Valeur estimée</p>
                  {stats.market_priced > 0 && stats.market_priced < stats.total_quantity && (
                    <p className="t-code pt-1 text-[var(--text-faint)]">
                      {stats.market_priced} sur {stats.total_quantity} cotées
                    </p>
                  )}
                </div>
                {stats.market_priced > 0 ? (
                  <p className="t-numeral shrink-0 text-[1.4rem] leading-none">
                    {money(stats.market_total)}
                  </p>
                ) : (
                  <p className="t-code shrink-0 text-[var(--text-faint)]">aucune carte cotée</p>
                )}
              </div>
            )
          ) : null}

          {/* Only under "Tout": the series is a total across the whole collection,
              so plotting it under "Doubles" would show a number that does not match
              the filtered list underneath it. Scoped to what history has ever priced
              rather than to entries.length, the way PriceChart itself works. */}
          {view === 'all' && valueHistory.length >= 2 && (
            <div className="px-5 pb-4">
              <PriceChart
                points={valueHistory.map((p) => ({ captured_at: p.captured_at, price: p.total }))}
              />
            </div>
          )}

          {view === 'doubles' && (
            doubles.length > 0 && (
              <div className="px-5 pb-4">
                {doublesValue.priced > 0 && doublesValue.priced < doubles.length && (
                  <p className="t-code pb-2 text-[var(--text-faint)]">
                    {doublesValue.priced} sur {doubles.length} cotées
                  </p>
                )}
                {doublesValue.priced > 0 ? (
                  <div className="grid grid-cols-2 gap-4">
                    {/* Both figures rather than one: what the stack is worth and what
                        it is worth to give away are different questions, and picking
                        one to show would answer only one of them. The card you would
                        keep is never in "échangeables" — see doublesValue above. */}
                    <div>
                      <p className="t-numeral text-[1.4rem] leading-none">{money(doublesValue.held)}</p>
                      <p className="t-code pt-1">possédées</p>
                    </div>
                    <div>
                      <p className="t-numeral text-[1.4rem] leading-none">{money(doublesValue.trade)}</p>
                      <p className="t-code pt-1">échangeables</p>
                    </div>
                  </div>
                ) : (
                  <p className="t-code text-[var(--text-faint)]">Aucun double coté pour l'instant.</p>
                )}
              </div>
            )
          )}

          {view === 'doubles' && doubles.length === 0 ? (
            <div className="pt-4">
              <EmptyState title="Aucun double pour l'instant">
                Une carte devient un double dès que tu en as plus d'un exemplaire.
              </EmptyState>
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.key}>
                {group.key && (
                  <p className="t-code border-b border-[rgba(243,230,203,.12)] px-4 py-2.5">{group.key}</p>
                )}
                {/* align-content: start. At 0.8% of the catalogue the last row is
                    always partial, and a stretched grid would centre three cards in
                    the middle of an empty band as though something had failed. */}
                <ul
                  className="grid grid-cols-3 content-start gap-1.5 px-4 pb-2 lg:grid-cols-6"
                >
                  {group.items.map((entry) => (
                    <Seated key={`${entry.card_id}-${entry.language}`} entry={entry} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtres"
        footer={
          <div className="flex gap-2">
            <div className="shrink-0">
              <Button variant="quiet" onClick={resetFilters} disabled={!applied.length}>
                Tout effacer
              </Button>
            </div>
            <Button full onClick={() => setFiltersOpen(false)}>
              Voir {source.length.toLocaleString('fr')} carte{source.length > 1 ? 's' : ''}
            </Button>
          </div>
        }
      >
        <Group label="Édition">
          <Segmented
            value={language ?? 'all'}
            options={[
              { value: 'all' as const, label: 'Les deux' },
              { value: 'en' as const, label: <Edition language="en" /> },
              { value: 'jp' as const, label: <Edition language="jp" /> },
            ]}
            onChange={(next) => setLanguage(next === 'all' ? null : (next as Language))}
            label="Édition"
          />
        </Group>

        <Group label="Vue">
          <Segmented
            value={view}
            options={[
              { value: 'all' as const, label: 'Tout' },
              { value: 'doubles' as const, label: 'Doubles' },
            ]}
            onChange={setView}
            label="Vue"
          />
        </Group>

        {/* Every direction shares one flat row of chips rather than a segmented
            control -- nine values, four opposite pairs and one on its own, and a
            segmented control built for nine entries would each shrink to a
            sliver. All nine share the same `sort` state, so only one is ever
            active regardless of how they're grouped visually. */}
        <Group label="Trier">
          <Chip active={sort === 'date_desc'} onClick={() => setSort('date_desc')}>
            Date d'ajout +
          </Chip>
          <Chip active={sort === 'date_asc'} onClick={() => setSort('date_asc')}>
            Date d'ajout -
          </Chip>
          <Chip active={sort === 'set_asc'} onClick={() => setSort('set_asc')}>
            Extension croissante
          </Chip>
          <Chip active={sort === 'set_desc'} onClick={() => setSort('set_desc')}>
            Extension décroissante
          </Chip>
          <Chip active={sort === 'price_desc'} onClick={() => setSort('price_desc')}>
            Valeur décroissante
          </Chip>
          <Chip active={sort === 'price_asc'} onClick={() => setSort('price_asc')}>
            Valeur croissante
          </Chip>
          <Chip active={sort === 'rarity_desc'} onClick={() => setSort('rarity_desc')}>
            Plus rare
          </Chip>
          <Chip active={sort === 'rarity_asc'} onClick={() => setSort('rarity_asc')}>
            Moins rare
          </Chip>
          <Chip active={sort === 'doublon'} onClick={() => setSort('doublon')}>
            Doublons d'abord
          </Chip>
        </Group>
      </Sheet>
    </Screen>
  )
}

/* Wrapped rather than scrolled sideways, the same reasoning as Filters.tsx's own
   Group: in a sheet there is room to show every option at once. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="pt-5 first:pt-2">
      <h3 className="t-eyebrow pb-2.5">{label}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  )
}

function FilterIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path
        d="M3 5h14M6 10h8M8.5 15h3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

/* One card on the plate. The quantity is only worth saying when it is more than one —
   a "1" on every card is noise on a screen whose whole job is showing what you hold. */
function Seated({ entry }: { entry: CollectionEntry }) {
  const src = entry.card ? imageUrl(entry.card) : null
  return (
    <li className="relative">
      <Link
        to={`/card/${encodeURIComponent(entry.card_id)}?language=${entry.language}`}
        aria-label={`${entry.card?.name ?? entry.card_id}, ${entry.quantity} en collection`}
        className="block"
      >
        {src ? (
          <img
            src={src}
            alt=""
            decoding="async"
            className="float aspect-[600/838] w-full object-cover"
          />
        ) : (
          <div className="sunken aspect-[600/838] w-full" />
        )}
        {entry.quantity > 1 && (
          <span
            className="t-numeral absolute right-0 bottom-0 px-1.5 py-0.5 text-[0.7rem]"
            style={{ background: 'rgba(4,18,26,.86)' }}
          >
            ×{entry.quantity}
          </span>
        )}
      </Link>
    </li>
  )
}
