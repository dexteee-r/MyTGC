import { useState } from 'react'
import { Button } from '../components/ui'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'

const MIN_PASSWORD = 10

/* One screen, two modes. Splitting sign-in and sign-up across two routes makes people
   who picked wrong start over; a single form that switches keeps what they typed. */
export function SignIn() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const tooShort = mode === 'up' && password.length > 0 && password.length < MIN_PASSWORD

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'in') await signIn(email, password)
      else await signUp(email, password, name || undefined)
    } catch (caught) {
      const status = caught instanceof ApiError ? caught.status : 0
      setError(
        status === 401
          ? 'Email ou mot de passe incorrect.'
          : status === 409
            ? 'Un compte existe déjà avec cet email.'
            : "Le serveur n'a pas répondu. Réessaie dans un instant.",
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col justify-center px-6">
      <p className="voice-label">Collection One Piece</p>
      <h1 className="voice-display pt-2 text-[2.5rem]">MyTCG</h1>
      <p className="pt-3 text-foam-dim">
        {mode === 'in'
          ? 'Connecte-toi pour retrouver ta collection.'
          : 'Crée un compte pour commencer une collection.'}
      </p>

      <form onSubmit={submit} className="pt-8">
        <label className="block">
          <span className="voice-label">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-xl bg-sea-raised px-4 outline-none"
          />
        </label>

        {mode === 'up' && (
          <label className="mt-4 block">
            <span className="voice-label">Nom affiché</span>
            <input
              type="text"
              autoComplete="nickname"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="facultatif"
              className="mt-2 min-h-12 w-full rounded-xl bg-sea-raised px-4 outline-none placeholder:text-foam-faint"
            />
          </label>
        )}

        <label className="mt-4 block">
          <span className="voice-label">Mot de passe</span>
          <input
            type="password"
            required
            /* Tells the password manager which flow this is, so it offers to save on
               sign-up and to fill on sign-in instead of guessing. */
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            minLength={mode === 'up' ? MIN_PASSWORD : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-xl bg-sea-raised px-4 outline-none"
          />
          {mode === 'up' && (
            <span className={`block pt-2 text-xs ${tooShort ? 'text-signal' : 'text-foam-faint'}`}>
              {MIN_PASSWORD} caractères minimum. La longueur compte plus que les
              symboles.
            </span>
          )}
        </label>

        {error && (
          <p role="alert" className="pt-4 text-sm text-signal">
            {error}
          </p>
        )}

        <div className="pt-6">
          <Button type="submit" size="lg" full disabled={busy || tooShort}>
            {busy ? 'Un instant…' : mode === 'in' ? 'Se connecter' : 'Créer le compte'}
          </Button>
        </div>
      </form>

      <button
        onClick={() => {
          setMode(mode === 'in' ? 'up' : 'in')
          setError(null)
        }}
        className="pt-6 text-sm text-foam-dim underline"
      >
        {mode === 'in' ? 'Pas encore de compte ? En créer un' : "J'ai déjà un compte"}
      </button>
    </div>
  )
}
