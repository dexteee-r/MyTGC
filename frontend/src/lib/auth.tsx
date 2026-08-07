import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api, setAccessToken, setTokenRenewer } from './api'
import { clearRefreshToken, loadRefreshToken, saveRefreshToken } from './session-store'
import type { UserProfile } from './types'

/* Session handling.

   The access token is held here in React state and mirrored into the api module —
   never localStorage, which an XSS can read. It lasts 15 minutes; the refresh token
   that renews it lives in an httpOnly cookie the page cannot touch.

   On boot the app asks for a refresh: if the cookie is still valid the person is
   already signed in and never sees a form. */

interface AuthState {
  ready: boolean
  user: UserProfile | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (
    email: string,
    password: string,
    displayName?: string,
    inviteCode?: string,
  ) => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [ready, setReady] = useState(false)
  const renewing = useRef<Promise<boolean> | null>(null)

  const apply = useCallback(
    (session: { access_token: string; refresh_token: string; user: UserProfile }) => {
      setAccessToken(session.access_token)
      setUser(session.user)
      // No-op in a browser: there the token is in a cookie the page cannot see.
      void saveRefreshToken(session.refresh_token)
    },
    [],
  )

  const clear = useCallback(() => {
    setAccessToken(null)
    setUser(null)
    void clearRefreshToken()
  }, [])

  /* Renewal is shared: several requests can hit a 401 at once, and each firing its
     own refresh would rotate the token repeatedly — which the server reads as reuse
     and answers by revoking the whole family, signing the person out. */
  const renew = useCallback(async () => {
    if (!renewing.current) {
      renewing.current = loadRefreshToken()
        .then((stored) => api.refresh(stored ?? undefined))
        .then((session) => {
          apply(session)
          return true
        })
        .catch(() => {
          clear()
          return false
        })
        .finally(() => {
          renewing.current = null
        })
    }
    return renewing.current
  }, [apply, clear])

  useEffect(() => {
    setTokenRenewer(renew)
    return () => setTokenRenewer(null)
  }, [renew])

  useEffect(() => {
    renew().finally(() => setReady(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const signIn = useCallback(
    async (email: string, password: string) => {
      apply(await api.login({ email, password }))
    },
    [apply],
  )

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string, inviteCode?: string) => {
      apply(
        await api.register({
          email,
          password,
          display_name: displayName,
          invite_code: inviteCode,
        }),
      )
    },
    [apply],
  )

  const signOut = useCallback(async () => {
    const stored = await loadRefreshToken()
    await api.logout(stored ?? undefined).catch(() => {})
    clear()
  }, [clear])

  return (
    <Ctx.Provider value={{ ready, user, signIn, signUp, signOut }}>{children}</Ctx.Provider>
  )
}

export function useAuth(): AuthState {
  const value = useContext(Ctx)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
