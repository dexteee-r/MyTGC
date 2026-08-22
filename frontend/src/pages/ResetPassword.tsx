import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui'
import { EyeIcon, EyeOffIcon } from '../components/icons'
import { ApiError, api } from '../lib/api'

const MIN_PASSWORD = 10

/* Two screens behind one route, the way SignIn is one screen behind two modes:
   which one shows depends on whether a `?token=` arrived, not on any state a
   person picked here. Nobody navigates from one to the other -- the request
   screen sends an email, the confirm screen is where that email's link lands. */
export function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  return token ? <ConfirmReset token={token} /> : <RequestReset />
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-end px-6 pb-10">
      <p className="t-code">Collection One Piece</p>
      <h1
        className="t-display pt-2 text-[2.5rem]"
        style={{ color: 'var(--color-paper-100)', textShadow: '0 4px 34px rgba(0,0,0,.55)' }}
      >
        {title}
      </h1>
      {children}
    </div>
  )
}

function RequestReset() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api.requestPasswordReset(email)
    } catch {
      // Swallowed: the server already answers identically whether or not the
      // address has an account, so a network hiccup here must not read as
      // "that email doesn't exist" either -- the confirmation is the same either way.
    } finally {
      setBusy(false)
      setSent(true)
    }
  }

  if (sent) {
    return (
      <Frame title="Vérifie ta boîte mail">
        <p className="pt-3 text-[var(--text-secondary)]">
          Si un compte existe avec cet email, un lien de réinitialisation vient d'être
          envoyé. Il expire dans une heure.
        </p>
        <Link to="/" className="pt-6 text-sm text-[var(--text-secondary)] underline">
          Retour à la connexion
        </Link>
      </Frame>
    )
  }

  return (
    <Frame title="Mot de passe oublié">
      <p className="pt-3 text-[var(--text-secondary)]">
        Indique l'email de ton compte : on t'envoie un lien pour en choisir un nouveau.
      </p>
      <form onSubmit={submit} className="pt-8">
        <label className="block">
          <span className="t-code">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-xl bg-[var(--surface-rail)] px-4 outline-none"
          />
        </label>
        <div className="pt-6">
          <Button type="submit" size="lg" full disabled={busy}>
            {busy ? 'Un instant…' : 'Envoyer le lien'}
          </Button>
        </div>
      </form>
      <Link to="/" className="pt-6 text-sm text-[var(--text-secondary)] underline">
        J'ai déjà un compte
      </Link>
    </Frame>
  )
}

function ConfirmReset({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.confirmPasswordReset(token, password)
      setDone(true)
    } catch (caught) {
      const status = caught instanceof ApiError ? caught.status : 0
      setError(
        status === 403
          ? "Ce lien n'est plus valable — il a peut-être expiré ou déjà servi."
          : "Le serveur n'a pas répondu. Réessaie dans un instant.",
      )
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Frame title="C'est fait">
        <p className="pt-3 text-[var(--text-secondary)]">
          Ton mot de passe a été changé. Les autres appareils connectés ont été
          déconnectés, par précaution.
        </p>
        <Link to="/" className="pt-6 block">
          <Button size="lg" full>Se connecter</Button>
        </Link>
      </Frame>
    )
  }

  return (
    <Frame title="Nouveau mot de passe">
      <form onSubmit={submit} className="pt-8">
        <label className="block" htmlFor="new-password">
          <span className="t-code">Nouveau mot de passe</span>
          <div className="relative mt-2">
            <input
              id="new-password"
              type={revealed ? 'text' : 'password'}
              required
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="min-h-12 w-full rounded-xl bg-[var(--surface-rail)] py-2 pr-12 pl-4 outline-none"
            />
            <button
              type="button"
              onClick={() => setRevealed((show) => !show)}
              aria-label={revealed ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              aria-pressed={revealed}
              className="absolute inset-y-0 right-1 flex w-11 items-center justify-center text-[var(--text-faint)]"
            >
              {revealed ? <EyeOffIcon className="size-5" /> : <EyeIcon className="size-5" />}
            </button>
          </div>
          <span className={`block pt-2 text-xs ${tooShort ? 'text-ember-500' : 'text-[var(--text-faint)]'}`}>
            {MIN_PASSWORD} caractères minimum. La longueur compte plus que les symboles.
          </span>
        </label>

        {error && (
          <p role="alert" className="pt-4 text-sm text-ember-500">
            {error}
          </p>
        )}

        <div className="pt-6">
          <Button type="submit" size="lg" full disabled={busy || tooShort}>
            {busy ? 'Un instant…' : 'Choisir ce mot de passe'}
          </Button>
        </div>
      </form>
    </Frame>
  )
}
