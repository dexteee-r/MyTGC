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

   The handoff also sketches links for export, legal notices and help. None of those
   exist, and a link that goes nowhere is worse than an absence, so they are left out
   until they are real. Same for a default edition: the choice lives in memory today
   and making it stick needs a server-side preference, which is in the backlog.      */

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

      <PageHeader title={user?.display_name || 'Compte'} meta={user?.email} />

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
      </section>

      {/* A log book you can take away. The collection is already in the client, so
          this costs a string and no backend — which is why it exists instead of
          being a link that goes nowhere. */}
      <section className="px-5 pt-8">
        <p className="t-eyebrow pb-2.5">Ta collection, ailleurs</p>
        <Button
          variant="quiet"
          full
          disabled={entries.length === 0}
          onClick={() => {
            downloadCollection(entries)
            show(`${entries.length} lignes exportées`)
          }}
        >
          Exporter en CSV
        </Button>
      </section>

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
