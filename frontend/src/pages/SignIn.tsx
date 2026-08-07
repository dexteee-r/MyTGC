import { useEffect, useState } from 'react'
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
    <div className="mx-auto flex h-full max-w-md flex-col justify-center px-6">
      <p className="t-code">Collection One Piece</p>
      <h1 className="t-stat pt-2 text-[2.5rem]">MyTCG</h1>
      <p className="pt-3 text-label-dim">
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
            className="mt-2 min-h-12 w-full rounded-xl bg-pocket px-4 outline-none"
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
              className="mt-2 min-h-12 w-full rounded-xl bg-pocket px-4 outline-none"
            />
            <span className="block pt-2 text-xs text-label-faint">
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
              className="mt-2 min-h-12 w-full rounded-xl bg-pocket px-4 outline-none placeholder:text-label-faint"
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
            className="mt-2 min-h-12 w-full rounded-xl bg-pocket px-4 outline-none"
          />
          {mode === 'up' && (
            <span className={`block pt-2 text-xs ${tooShort ? 'text-alert' : 'text-label-faint'}`}>
              {MIN_PASSWORD} caractères minimum. La longueur compte plus que les
              symboles.
            </span>
          )}
        </label>

        {error && (
          <p role="alert" className="pt-4 text-sm text-alert">
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
        <p className="pt-6 text-sm text-label-faint">Les inscriptions sont fermées.</p>
      ) : (
        <button
          onClick={() => {
            setMode(mode === 'in' ? 'up' : 'in')
            setError(null)
          }}
          className="pt-6 text-sm text-label-dim underline"
        >
          {mode === 'in' ? 'Pas encore de compte ? En créer un' : "J'ai déjà un compte"}
        </button>
      )}
    </div>
  )
}
