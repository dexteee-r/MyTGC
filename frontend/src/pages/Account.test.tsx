import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../lib/auth'
import { CollectionProvider } from '../lib/collection'
import { LanguageProvider } from '../lib/language'
import { ToastProvider } from '../lib/toast'
import type { DeviceSession } from '../lib/types'
import { Account } from './Account'

/* Appareils connectés: refresh_tokens.user_agent has been in the schema since
   sessions were built, never surfaced anywhere until this section. Only that
   section is under test here — the rest of Account.tsx (export, password,
   deletion) is unrelated to this task. */

function mount(sessions: DeviceSession[]) {
  const calls: { url: string; method: string }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET'
      calls.push({ url, method })
      if (url.includes('/auth/sessions/')) {
        return { ok: true, status: 204, text: async () => '', json: async () => undefined } as Response
      }
      if (url.includes('/auth/sessions')) {
        return { ok: true, status: 200, json: async () => sessions, text: async () => '' } as Response
      }
      if (url.includes('/auth/me') && method === 'PATCH') {
        const body = init?.body ? JSON.parse(init.body as string) : {}
        return {
          ok: true, status: 200, text: async () => '',
          json: async () => ({
            id: 1, email: 'a@example.com', display_name: body.display_name ?? null,
            created_at: null, default_language: 'en', grid_columns: 2,
            goal_pack_code: null, goal_language: null,
          }),
        } as Response
      }
      if (url.includes('/collection/stats')) {
        return {
          ok: true, status: 200, text: async () => '',
          json: async () => ({
            distinct_cards: 0, total_quantity: 0, by_language: {}, by_rarity: {},
            acquisition_total: 0, market_total: 0, market_priced: 0, market_currency: 'EUR',
          }),
        } as Response
      }
      if (url.includes('/collection')) {
        return { ok: true, status: 200, json: async () => [], text: async () => '' } as Response
      }
      if (url.includes('/packs')) {
        return { ok: true, status: 200, json: async () => [], text: async () => '' } as Response
      }
      if (url.includes('/health')) {
        return {
          ok: true, status: 200, text: async () => '',
          json: async () => ({ status: 'ok', catalogue: {}, hashed_cards: 0, scan_enabled: false }),
        } as Response
      }
      // /auth/refresh on AuthProvider mount, and anything else unanticipated.
      return { ok: false, status: 401, text: async () => '', json: async () => ({}) } as Response
    }),
  )

  return { ...render(
    <MemoryRouter>
      <AuthProvider>
        <LanguageProvider>
          <CollectionProvider>
            <ToastProvider>
              <Account />
            </ToastProvider>
          </CollectionProvider>
        </LanguageProvider>
      </AuthProvider>
    </MemoryRouter>,
  ), calls }
}

function session(over: Partial<DeviceSession> = {}): DeviceSession {
  return {
    id: 1,
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
    issued_at: '2026-08-10T10:00:00',
    expires_at: '2026-09-09T10:00:00',
    current: true,
    ...over,
  }
}

describe('appareils connectés', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('repère l’appareil courant et devine navigateur + système à partir du user_agent', async () => {
    mount([session()])
    expect(await screen.findByText(/Chrome sur Windows/)).toBeTruthy()
    expect(screen.getByText('Cet appareil')).toBeTruthy()
  })

  it('ne propose pas de déconnecter l’appareil courant', async () => {
    mount([session()])
    await screen.findByText(/Chrome sur Windows/)
    expect(screen.queryByText('Déconnecter')).toBeNull()
  })

  it('liste un second appareil avec un bouton pour le déconnecter', async () => {
    mount([
      session(),
      session({
        id: 2, current: false,
        user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1',
      }),
    ])
    expect(await screen.findByText(/Safari sur iPhone/)).toBeTruthy()
    expect(screen.getByText('Déconnecter')).toBeTruthy()
  })

  it('un user_agent absent se lit comme "Appareil inconnu", pas comme une case vide', async () => {
    mount([session({ id: 2, current: false, user_agent: null })])
    expect(await screen.findByText('Appareil inconnu')).toBeTruthy()
  })

  it('révoquer un appareil le retire de la liste et appelle le bon endpoint', async () => {
    const { calls } = mount([
      session(),
      session({
        id: 42, current: false,
        user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1',
      }),
    ])
    await screen.findByText(/Safari sur iPhone/)

    fireEvent.click(screen.getByText('Déconnecter'))

    await waitFor(() => expect(screen.queryByText(/Safari sur iPhone/)).toBeNull())
    expect(calls.some((c) => c.url.includes('/auth/sessions/42') && c.method === 'DELETE')).toBe(true)
    // The current device's own row survives the revocation of the other one.
    expect(screen.getByText(/Chrome sur Windows/)).toBeTruthy()
  })
})

describe('nom affiché', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('le bouton reste désactivé tant que rien de nouveau n’est saisi', async () => {
    mount([])
    const button = await screen.findByText('Enregistrer')
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('un nom composé uniquement d’espaces ne compte pas comme un changement', async () => {
    mount([])
    const field = await screen.findByLabelText('Nom affiché')
    fireEvent.change(field, { target: { value: '   ' } })
    expect((screen.getByText('Enregistrer') as HTMLButtonElement).disabled).toBe(true)
  })

  it('enregistre le nom saisi', async () => {
    const { calls } = mount([])
    const field = await screen.findByLabelText('Nom affiché')
    fireEvent.change(field, { target: { value: 'Barbe Noire' } })

    const button = screen.getByText('Enregistrer')
    expect((button as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(button)

    await waitFor(() => {
      const patch = calls.find((c) => c.url.includes('/auth/me') && c.method === 'PATCH')
      expect(patch).toBeTruthy()
    })
  })
})
