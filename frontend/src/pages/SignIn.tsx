import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui'
import { ApiError, api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { RegistrationPolicy } from '../lib/types'

const MIN_PASSWORD = 10

/* One screen, two modes. Splitting sign-in and sign-up across two routes makes people
   who picked wrong start over; a single form that switches keeps what they typed. */
export function SignIn() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [policy, setPolicy] = useState<RegistrationPolicy | null>(null)

  /* Ask the server what sign-up requires rather than assuming. The very first
     account needs no code — nobody exists to issue one — so the field would be a
     dead end on a fresh instance. */
  useEffect(() => {
    api.registrationPolicy().then(setPolicy).catch(() => {})
  }, [])

  const needsCode = policy?.mode === 'invite'
  const signUpClosed = policy?.mode === 'closed' 
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const tooShort = mode === 'up' && password.length > 0 && password.length < MIN_PASSWORD

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'in') await signIn(email, password)
      else await signUp(email, password, name || undefined, code || undefined)
    } catch (caught) {
      const status = caught instanceof ApiError ? caught.status : 0
      setError(
        status === 401
          ? 'Email ou mot de passe incorrect.'
          : status === 409
            ? 'Un compte existe déjà avec cet email.'
            : status === 403
              ? "Ce code d'invitation n'est pas valable."
              : "Le serveur n'a pas répondu. Réessaie dans un instant.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-end px-6 pb-10">
      <p className="t-code">Collection One Piece</p>
      <h1
        className="t-display pt-2 text-[3.5rem]"
        style={{ color: 'var(--color-paper-100)', textShadow: '0 4px 34px rgba(0,0,0,.55)' }}
      >
        MyTCG
      </h1>
      <p className="pt-3 text-[var(--text-secondary)]">
        {mode === 'in'
          ? 'Connecte-toi pour retrouver ta collection.'
          : 'Crée un compte pour commencer une collection.'}
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

        {mode === 'up' && needsCode && (
          <label className="mt-4 block">
            <span className="t-code">Code d'invitation</span>
            <input
              type="text"
              required
              autoComplete="off"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="mt-2 min-h-12 w-full rounded-xl bg-[var(--surface-rail)] px-4 outline-none"
            />
            <span className="block pt-2 text-xs text-[var(--text-faint)]">
              Les inscriptions se font sur invitation. Demande un code à quelqu'un qui a
              déjà un compte.
            </span>
          </label>
        )}

        {mode === 'up' && (
          <label className="mt-4 block">
            <span className="t-code">Nom affiché</span>
            <input
              type="text"
              autoComplete="nickname"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="facultatif"
              className="mt-2 min-h-12 w-full rounded-xl bg-[var(--surface-rail)] px-4 outline-none placeholder:text-[var(--text-faint)]"
            />
          </label>
        )}

        <label className="mt-4 block">
          <span className="t-code">Mot de passe</span>
          <input
            type="password"
            required
            /* Tells the password manager which flow this is, so it offers to save on
               sign-up and to fill on sign-in instead of guessing. */
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            minLength={mode === 'up' ? MIN_PASSWORD : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-xl bg-[var(--surface-rail)] px-4 outline-none"
          />
          {mode === 'up' && (
            <span className={`block pt-2 text-xs ${tooShort ? 'text-ember-500' : 'text-[var(--text-faint)]'}`}>
              {MIN_PASSWORD} caractères minimum. La longueur compte plus que les
              symboles.
            </span>
          )}
        </label>

        {error && (
          <p role="alert" className="pt-4 text-sm text-ember-500">
            {error}
          </p>
        )}

        <div className="pt-6">
          <Button type="submit" size="lg" full disabled={busy || tooShort}>
            {busy ? 'Un instant…' : mode === 'in' ? 'Se connecter' : 'Créer le compte'}
          </Button>
        </div>
      </form>

      {signUpClosed && mode === 'in' ? (
        <p className="pt-6 text-sm text-[var(--text-faint)]">Les inscriptions sont fermées.</p>
      ) : (
        <button
          onClick={() => {
            setMode(mode === 'in' ? 'up' : 'in')
            setError(null)
          }}
          className="pt-6 text-sm text-[var(--text-secondary)] underline"
        >
          {mode === 'in' ? 'Pas encore de compte ? En créer un' : "J'ai déjà un compte"}
        </button>
      )}

      {/* The only page the public reaches, so the notice hangs off it. Faint and at
          the foot: it has to be findable, not prominent. */}
      <Link to="/legal" className="pt-5 text-xs text-[var(--text-faint)] underline">
        Mentions légales
      </Link>
    </div>
  )
}
