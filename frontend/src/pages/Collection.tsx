import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { InfoIcon, LinkIcon } from '../components/icons'
import { PriceChart } from '../components/PriceChart'
import { ShareDialog } from '../components/ShareDialog'
import {
  Button,
  Dialog,
  EmptyState,
  PageHeader,
  Screen,
  Segmented,
  Sounding,
} from '../components/ui'
import { api, imageUrl } from '../lib/api'
import { useCollection } from '../lib/collection'
import { money } from '../lib/money'
import type { CollectionEntry, ValuePoint } from '../lib/types'

type Sort = 'recent' | 'set' | 'name'
type View = 'all' | 'doubles'

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
  const [sort, setSort] = useState<Sort>('recent')
  const [view, setView] = useState<View>('all')
  const [infoOpen, setInfoOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [valueHistory, setValueHistory] = useState<ValuePoint[]>([])

  // Its own request rather than folded into useCollection: every other screen that
  // context feeds has no use for a time series, and a failure here should leave the
  // rest of the page alone rather than blank the whole collection over a chart.
  useEffect(() => {
    api.collectionValueHistory().then(setValueHistory).catch(() => {})
  }, [])

  /* What is worth trading: every card held more than once. The card you'd keep is
     never in this count — a stack of three shows two, because the base of a trade
     is what you can give away without emptying your own binder. */
  const doubles = useMemo(() => entries.filter((entry) => entry.quantity > 1), [entries])

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

  const source = view === 'doubles' ? doubles : entries

  const groups = useMemo(() => {
    const sorted = [...source]
    if (sort === 'name') {
      sorted.sort((a, b) => (a.card?.name ?? a.card_id).localeCompare(b.card?.name ?? b.card_id))
    } else if (sort === 'set') {
      sorted.sort((a, b) => (a.card?.pack_code ?? 'zz').localeCompare(b.card?.pack_code ?? 'zz'))
    }
    if (sort !== 'set') return [{ key: '', items: sorted }]

    const buckets = new Map<string, typeof sorted>()
    for (const entry of sorted) {
      const key = entry.card?.pack_code ?? 'Sans extension'
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key)!.push(entry)
    }
    return [...buckets].map(([key, items]) => ({ key, items }))
  }, [source, sort])

  if (!ready) return <div className="pt-10"><Sounding label="Ouverture du journal" /></div>

  return (
    <Screen>
      <PageHeader
        title="Collection"
        meta={
          stats
            ? `${stats.total_quantity} cartes · ${stats.distinct_cards} références`
            : undefined
        }
        action={
          <div className="flex shrink-0">
            <button
              onClick={() => setShareOpen(true)}
              aria-label="Partager ma collection"
              className="flex size-11 items-center justify-center rounded-full text-[var(--text-secondary)]"
            >
              <LinkIcon className="size-5" />
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
            <strong style={{ color: 'var(--text-primary)' }}>Tout / Doubles</strong> change
            quelles cartes sont listées. « Doubles » ne garde que celles possédées en
            plusieurs exemplaires, avec deux totaux distincts : <em>possédées</em> compte
            tout ce que tu en as, <em>échangeables</em> ne compte que le surplus — un
            exemplaire de chaque reste toujours dans ton classeur.
          </p>
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Trier</strong> ordonne la
            liste par date d'ajout, par extension, ou alphabétiquement. Ça ne change
            jamais quelles cartes sont affichées, seulement leur ordre.
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
          {/* A second axis from the sort below it, the way PackDetail's own view
              selector sits apart from nothing to sort within a single set — here it
              decides which cards are on the table at all before sort decides their
              order. */}
          <Segmented
            value={view}
            options={[
              { value: 'all' as const, label: 'Tout' },
              { value: 'doubles' as const, label: 'Doubles' },
            ]}
            onChange={setView}
            label="Vue"
          />

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

          <Segmented
            value={sort}
            options={[
              { value: 'recent', label: 'Récentes' },
              { value: 'set', label: 'Par extension' },
              { value: 'name', label: 'A → Z' },
            ]}
            onChange={setSort}
            label="Trier"
          />

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
    </Screen>
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
