import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeftIcon } from '../components/icons'
import { Button, PageHeader, Screen, Segmented } from '../components/ui'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCollection } from '../lib/collection'
import { Breakdown } from '../components/Breakdown'
import { downloadCollection } from '../lib/export'
import { LANGUAGE_OPTIONS, useLanguage } from '../lib/language'
import { useToast } from '../lib/toast'
import type { Health, Pack } from '../lib/types'

const MIN_PASSWORD = 10

/* ── The log book ──────────────────────────────────────────────────────────────────
   A record of the voyage rather than a settings page. The numbers come first — what
   is aboard, and how far along the chart it goes — and the machinery of the account
   sits under them where it belongs.

   The handoff sketches a list of three rows: export, legal notices, help. Export is
   real and is here; the other two still lead nowhere and stay out until they do not.
   Everything below the fold — password, sign-out, deletion — is machinery the
   handoff never drew, so it follows the same rails rather than inventing its own.  */

export function Account() {
  const { user, signOut } = useAuth()
  const { stats, entries } = useCollection()
  const { language, setLanguage } = useLanguage()
  const { show } = useToast()
  const navigate = useNavigate()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [packs, setPacks] = useState<Pack[] | null>(null)
  const [health, setHealth] = useState<Health | null>(null)

  useEffect(() => {
    api.packs().then(setPacks).catch(() => {})
    api.health().then(setHealth).catch(() => {})
  }, [])

  /* Both editions, because this is the whole binder and not the one being browsed. */
  const catalogue = useMemo(
    () => Object.values(health?.catalogue ?? {}).reduce((sum, n) => sum + n, 0),
    [health],
  )
  const started = (packs ?? []).filter((pack) => pack.owned_count > 0).length
  const distinct = stats?.distinct_cards ?? 0
  const share = catalogue > 0 ? (distinct / catalogue) * 100 : null

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.changePassword({ current_password: current, new_password: next })
      setCurrent('')
      setNext('')
      // The server revokes every other session on a password change, so say so —
      // otherwise the other device silently signing out looks like a bug.
      show('Mot de passe changé. Les autres appareils sont déconnectés.')
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 401
          ? 'Mot de passe actuel incorrect.'
          : "Le changement n'a pas abouti.",
      )
    } finally {
      setBusy(false)
    }
  }

  const removeAccount = async () => {
    setBusy(true)
    try {
      await api.deleteAccount()
      await signOut()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <header className="flex items-center gap-2 px-3 pt-4">
        <button
          onClick={() => navigate(-1)}
          aria-label="Revenir"
          className="flex size-11 items-center justify-center rounded-full text-[var(--text-secondary)]"
        >
          <ChevronLeftIcon className="size-6" />
        </button>
      </header>

      {/* A log book, not a settings page — so it is titled as one, and the account it
          belongs to is the line above rather than the heading. */}
      <PageHeader title="Carnet de bord" meta={user?.email} />

      {/* Four quarters. A 1px rail between them rather than four cards: it is one
          reading of one collection, not four separate facts. */}
      <dl className="grid grid-cols-2 gap-px" style={{ background: 'var(--surface-rail)' }}>
        <Quarter value={stats?.total_quantity ?? 0} label="cartes rangées" />
        <Quarter value={distinct} label="références" />
        <Quarter value={started} label={`extension${started > 1 ? 's' : ''} entamée${started > 1 ? 's' : ''}`} />
        <Quarter
          value={share === null ? '—' : `${share.toFixed(1).replace('.', ',')} %`}
          label="du catalogue"
        />
      </dl>

      {stats && (stats.market_priced > 0 || stats.acquisition_total > 0) && (
        <section className="pt-8">
          <p className="t-eyebrow px-5 pb-2.5">Valeur</p>
          <dl className="grid grid-cols-2 gap-px" style={{ background: 'var(--surface-rail)' }}>
            <Quarter value={money(stats.market_total)} label="valeur estimée" />
            <Quarter value={money(stats.acquisition_total)} label="prix payé" />
          </dl>
          {/* Where the number comes from, in the place where it could mislead. The
              feed is the American market and it does not cover everything, so the
              screen says both rather than letting a total pass for an appraisal. */}
          <p className="px-5 pt-3 text-sm text-[var(--text-secondary)]">
            {stats.market_priced === 0
              ? "Aucune carte de ta collection n'est cotée pour l'instant."
              : `Cotées : ${stats.market_priced} carte${stats.market_priced > 1 ? 's' : ''} sur ${stats.total_quantity}. Prix du marché américain (TCGplayer), convertis en euros au taux du jour — pas des prix Cardmarket.`}
          </p>
        </section>
      )}

      {stats && <Breakdown stats={stats} />}

      {/* The default edition. It belongs here rather than in a settings screen that
          does not exist, and it is the account's setting now, not the session's. */}
      <section className="px-5 pt-8">
        <p className="t-eyebrow pb-2.5">Édition par défaut</p>
        <Segmented
          value={language}
          options={LANGUAGE_OPTIONS}
          onChange={setLanguage}
          label="Édition par défaut"
        />
        {/* The setting names itself but does not explain itself: which edition is
            "default" only means something once you know what reads it. */}
        <p className="pt-2.5 text-sm text-[var(--text-secondary)]">
          Détermine l'édition proposée après un scan et à l'ouverture d'une recherche.
          Tu peux en changer à tout moment.
        </p>
      </section>

      {/* A log book you can take away. The handoff draws this as a row in a list of
          three, with legal notices and help beside it; those two still lead nowhere,
          and a row that does nothing is worse than a row that is absent. So the list
          is here, in its style, holding the one entry that is real. */}
      <div className="mt-8 border-t border-[rgba(243,230,203,.12)]">
        <button
          disabled={entries.length === 0}
          onClick={() => {
            downloadCollection(entries)
            show(`${entries.length} lignes exportées`)
          }}
          className="flex min-h-[var(--touch)] w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-medium disabled:opacity-40"
        >
          Exporter ma collection
          <span aria-hidden className="text-[var(--text-faint)]">
            ›
          </span>
        </button>
      </div>

      <form onSubmit={changePassword} className="px-5 pt-8">
        <p className="t-eyebrow">Mot de passe</p>
        <label className="mt-3 block">
          <span className="t-code">Actuel</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            className="mt-2 min-h-[var(--touch)] w-full rounded-full px-4 outline-none"
            style={{ background: 'var(--surface-recessed)' }}
          />
        </label>
        <label className="mt-3 block">
          <span className="t-code">Nouveau</span>
          <input
            type="password"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            className="mt-2 min-h-[var(--touch)] w-full rounded-full px-4 outline-none"
            style={{ background: 'var(--surface-recessed)' }}
          />
        </label>
        {error && (
          <p role="alert" className="pt-3 text-sm text-ember-500">
            {error}
          </p>
        )}
        <div className="pt-4">
          <Button type="submit" variant="quiet" disabled={busy || next.length < MIN_PASSWORD}>
            Changer le mot de passe
          </Button>
        </div>
      </form>

      <div className="mx-5 mt-8 border-t border-[rgba(243,230,203,.12)] pt-6">
        <Button variant="quiet" full onClick={signOut}>
          Se déconnecter
        </Button>
      </div>

      <section className="mx-5 mt-10 mb-4 rounded-[14px] p-4"
        style={{ boxShadow: 'inset 0 0 0 1px rgba(217,58,32,.32)' }}>
        <p className="t-eyebrow text-ember-500">Supprimer le compte</p>
        <p className="pt-1 text-sm text-[var(--text-secondary)]">
          Ta collection et ta wishlist sont supprimées avec le compte. Le catalogue des
          cartes n'est pas affecté. C'est définitif.
        </p>
        <div className="pt-4">
          {confirmDelete ? (
            <div className="flex gap-2">
              <Button variant="destructive" onClick={removeAccount} disabled={busy}>
                Confirmer la suppression
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Annuler
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
              Supprimer mon compte
            </Button>
          )}
        </div>
      </section>
    </Screen>
  )
}

/* Cents only when there are cents: a collection worth 40 € should not read 40,00 €
   next to a count, and one worth 12,50 € must not round to 13. */
function money(amount: number): string {
  return `${amount.toLocaleString('fr', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  })} €`
}

function Quarter({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="px-5 py-5" style={{ background: 'var(--color-sea-900)' }}>
      <dd className="t-numeral text-[1.9rem]">
        {typeof value === 'number' ? value.toLocaleString('fr') : value}
      </dd>
      <dt className="t-code pt-2">{label}</dt>
    </div>
  )
}
