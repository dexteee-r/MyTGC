import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, setTokenRenewer } from './api'
import { AuthProvider, useAuth } from './auth'

const SESSION = {
  access_token: 'access-1',
  token_type: 'bearer',
  expires_in: 900,
  refresh_token: 'refresh-1',
  user: { id: 1, email: 'a@example.com', display_name: 'A', created_at: null },
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
)

describe('sessions', () => {
  beforeEach(() => {
    setTokenRenewer(null)
  })

  it('signs the person in silently when the refresh cookie is still valid', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, status: 200, json: async () => SESSION, text: async () => '',
    } as Response)))

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.user?.email).toBe('a@example.com')
  })

  it('shows the sign-in form when there is no valid session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 401, text: async () => 'no refresh token supplied',
    } as Response)))

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.user).toBeNull()
  })

  it('renews once when several requests expire at the same moment', async () => {
    /* This is the bug this design exists to prevent. Each caller firing its own
       refresh rotates the token repeatedly, the server reads the second use of a
       spent token as theft, revokes the family — and the person is signed out in
       the middle of using the app. */
    let refreshes = 0
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/auth/refresh')) {
        refreshes += 1
        await new Promise((resolve) => setTimeout(resolve, 10))
        return { ok: true, status: 200, json: async () => SESSION, text: async () => '' } as Response
      }
      return { ok: false, status: 401, text: async () => '' } as Response
    }))

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.ready).toBe(true))
    refreshes = 0

    // Three calls that all hit a stale access token at once.
    await Promise.all([
      api.collection().catch(() => {}),
      api.collectionStats().catch(() => {}),
      api.packs().catch(() => {}),
    ])

    expect(refreshes).toBe(1)
  })

  it('forgets the person on sign-out even if the server call fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/auth/logout')) throw new Error('offline')
      return { ok: true, status: 200, json: async () => SESSION, text: async () => '' } as Response
    }))

    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.user).not.toBeNull())

    await result.current.signOut()
    // Staying signed in because the network hiccuped is the wrong way to fail.
    await waitFor(() => expect(result.current.user).toBeNull())
  })
})
