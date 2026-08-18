import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { CardGrid } from '../components/CardGrid'
import { ChevronLeftIcon, FlagIcon } from '../components/icons'
import { Adrift, Button, EmptyState, Segmented, Sounding } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCollection } from '../lib/collection'
import { useToast } from '../lib/toast'
import type { Card, Language, WishlistBulkResult } from '../lib/types'

const PAGE = 60
type View = 'all' | 'missing' | 'owned'

/* What actually happened, in words. Reporting the number asked for rather than the
   number added would make the button look broken the second time it is pressed —
   it would claim 150 additions and the want list would not have moved. */
export function summarise({ missing, added, already_listed }: WishlistBulkResult): string {
  const cards = (n: number) => `${n} carte${n > 1 ? 's' : ''}`
  if (added === 0) {
    return missing === 0
      ? 'Rien ne manque dans cette extension.'
      : `${cards(missing)} déjà dans tes recherchées.`
  }
  if (already_listed === 0) {
    return `${cards(added)} ajoutée${added > 1 ? 's' : ''} aux recherchées.`
  }
  const were = already_listed > 1 ? 'y étaient déjà' : 'y était déjà'
  return `${cards(added)} ajoutée${added > 1 ? 's' : ''}, ${already_listed} ${were}.`
}

/* One divider, opened. The page shows every slot in the set — the ones you hold as
   cards, the ones you do not as empty pockets — so "what am I missing" is answered
   by looking rather than by filtering. The filter is still there for when the set is
   large enough that looking is not enough.

   Filtering happens server-side. Doing it on the loaded page made the header
   disagree with the list of dividers, and left "Possédées" empty whenever the cards
   held happened to sit past the first sixty by number. */
export function PackDetail() {
  const { packCode = '' } = useParams()
  const [params] = useSearchParams()
  const language = (params.get('language') ?? 'en') as Language
  const { entries } = useCollection()

  const [cards, setCards] = useState<Card[]>([])
  const [total, setTotal] = useState(0)
  const [setSize, setSetSize] = useState(0)
  const [ownedTotal, setOwnedTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [view, setView] = useState<View>('all')
  const [sending, setSending] = useState(false)
  const [settingGoal, setSettingGoal] = useState(false)
  const { show } = useToast()
  const { user, setUser } = useAuth()

  const isGoal = user?.goal_pack_code === packCode && user?.goal_language === language

  const filter = {
    pack_code: packCode,
    language,
    ...(view === 'all' ? {} : { owned: view === 'owned' }),
  }

  useEffect(() => {
    setLoading(true)
    setFailed(false)
    setCards([])
    api
      .cards({ ...filter, limit: PAGE })
      .then((page) => {
        setCards(page.items)
        setTotal(page.total)
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packCode, language, view])

  useEffect(() => {
    Promise.all([
      api.cards({ pack_code: packCode, language, limit: 1 }),
      api.cards({ pack_code: packCode, language, owned: true, limit: 1 }),
    ])
      .then(([all, owned]) => {
        setSetSize(all.total)
        setOwnedTotal(owned.total)
      })
      .catch(() => {})
  }, [packCode, language, entries])

  /* One call, not one per card. Looping over addToWishlist would be 150 round trips
     and would reset the priority, price and notes on every card already wanted,
     because that endpoint treats a repeat as an edit. */
  const wantAllMissing = async () => {
    setSending(true)
    try {
      const result = await api.wantEverythingMissing({ pack_code: packCode, language })
      show(summarise(result))
    } catch {
      show("L'ajout n'a pas abouti.")
    } finally {
      setSending(false)
    }
  }

  /* The pair moves together — the server refuses one field without the other,
     because a code alone cannot say which printing it means. Awaited rather than
     fire-and-forget like the edition switch in language.tsx: that one is a light,
     frequent flip with nothing that can fail; this is deliberate and occasional, and
     a silent failure would leave someone believing they had set a goal that never
     landed. */
  const toggleGoal = async () => {
    setSettingGoal(true)
    try {
      const updated = await api.updateProfile(
        isGoal
          ? { goal_pack_code: null, goal_language: null }
          : { goal_pack_code: packCode, goal_language: language },
      )
      setUser(updated)
      show(isGoal ? 'Objectif retiré.' : `${packCode} devient l'objectif du Classeur.`)
    } catch {
      show("Le changement n'a pas abouti.")
    } finally {
      setSettingGoal(false)
    }
  }

  const loadMore = () => {
    if (cards.length >= total || loading) return
    api
      .cards({ ...filter, limit: PAGE, offset: cards.length })
      .then((page) =>
        setCards((current) => (current.length >= total ? current : [...current, ...page.items])),
      )
      .catch(() => {})
  }

  const packName = cards[0]?.pack_name ?? null

  return (
    <div className="flex h-full flex-col">
      <header className="px-3 pt-4 pb-3">
        <div className="flex items-center gap-1">
          <Link
            to="/packs"
            aria-label="Revenir aux extensions"
            className="flex size-[var(--touch)] shrink-0 items-center justify-center text-[var(--text-secondary)]"
          >
            <ChevronLeftIcon className="size-5" />
          </Link>
          <h1 className="t-display min-w-0 flex-1 truncate text-[2.125rem]">{packCode}</h1>
          <span className="t-numeral shrink-0 pr-2 text-[1.35rem]">
            {ownedTotal}
            <span className="text-[var(--text-faint)]">/{setSize}</span>
          </span>
        </div>
        {packName && <p className="t-eyebrow truncate px-2 pt-2">{packName}</p>}
        <div className="channel mt-3 w-full">
          <div style={{ width: setSize ? `${(ownedTotal / setSize) * 100}%` : 0 }} />
        </div>

        {/* setSize > 0 rather than always shown: an id typed straight into the URL
            can still resolve to nothing, and offering to chase an empty page would
            only add a second failure on top of the first. (Not the Promos anymore
            -- SET_KEY in main.py now falls back to pack_id wherever pack_code is
            null, so a real Promos set does resolve.) */}
        {setSize > 0 && (
          <button
            onClick={toggleGoal}
            disabled={settingGoal}
            aria-pressed={isGoal}
            className="mt-3 inline-flex min-h-[var(--touch)] items-center gap-1.5 rounded-full px-3 text-sm transition disabled:opacity-50"
            style={{
              color: isGoal ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: isGoal ? 'inset 0 0 0 1px var(--surface-rail)' : 'none',
              fontWeight: isGoal ? 600 : 400,
            }}
          >
            <FlagIcon className="size-4" />
            {isGoal ? 'Objectif du Classeur' : 'Définir comme objectif'}
          </button>
        )}
      </header>

      <Segmented
        value={view}
        options={[
          { value: 'all', label: 'La page' },
          { value: 'missing', label: 'Manquantes' },
          { value: 'owned', label: 'Possédées' },
        ]}
        onChange={setView}
        label="Filtrer"
      />

      {/* Only under "Manquantes", where the count on the button is exactly what the
          list below it shows — offered from any other view, "tout" would mean
          something the screen is not displaying. */}
      {view === 'missing' && !loading && !failed && total > 0 && (
        <div className="px-5 pt-3">
          <Button variant="quiet" full disabled={sending} onClick={wantAllMissing}>
            {sending
              ? 'Ajout…'
              : `Ajouter les ${total} manquantes aux recherchées`}
          </Button>
        </div>
      )}

      {failed ? (
        <div className="pt-8"><Adrift onRetry={() => setView(view)} /></div>
      ) : loading ? (
        <div className="pt-8"><Sounding label={`Sondage de ${packCode}`} /></div>
      ) : cards.length === 0 ? (
        <div className="pt-8">
          <EmptyState title={view === 'owned' ? 'Aucune carte de cette extension' : 'Extension complète'}>
            {view === 'owned'
              ? 'Scanne une carte pour commencer cette page.'
              : 'Toutes les pochettes sont pleines.'}
          </EmptyState>
        </div>
      ) : (
        <CardGrid cards={cards} onEndReached={loadMore} loadingMore={cards.length < total} />
      )}
    </div>
  )
}
