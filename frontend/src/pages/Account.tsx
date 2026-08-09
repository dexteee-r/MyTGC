import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeftIcon } from '../components/icons'
import { Button, PageHeader, Screen } from '../components/ui'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCollection } from '../lib/collection'
import { useToast } from '../lib/toast'

const MIN_PASSWORD = 10

export function Account() {
  const { user, signOut } = useAuth()
  const { stats } = useCollection()
  const { show } = useToast()
  const navigate = useNavigate()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

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

      <section className="deck mx-5 rounded-[2px] p-4">
        <p className="t-code">Collection</p>
        <p className="tabular-nums pt-1 text-lg font-bold">
          {stats?.total_quantity ?? 0} cartes · {stats?.distinct_cards ?? 0} références
        </p>
      </section>

      <form onSubmit={changePassword} className="deck mx-5 mt-4 rounded-[2px] p-4">
        <p className="font-semibold">Changer le mot de passe</p>
        <label className="mt-3 block">
          <span className="t-code">Actuel</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            className="sunken mt-2 min-h-12 w-full px-4 outline-none"
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
            className="sunken mt-2 min-h-12 w-full px-4 outline-none"
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

      <div className="mx-5 mt-4">
        <Button variant="quiet" full onClick={signOut}>
          Se déconnecter
        </Button>
      </div>

      <section className="mx-5 mt-8 rounded-none border border-ember-500/30 p-4">
        <p className="font-semibold text-ember-500">Supprimer le compte</p>
        <p className="pt-1 text-sm text-[var(--text-secondary)]">
          Ta collection et ta wishlist sont supprimées avec le compte. Le catalogue des
          cartes n'est pas affecté. C'est définitif.
        </p>
        <div className="pt-4">
          {confirmDelete ? (
            <div className="flex gap-2">
              <Button variant="primary" onClick={removeAccount} disabled={busy}>
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
