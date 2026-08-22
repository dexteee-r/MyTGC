import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResetPassword } from './ResetPassword'

/* No `?token=` -> request a link; `?token=...` -> spend it on a new password. The
   split lives entirely in the URL, since that's the only thing that differs between
   opening the page fresh and arriving from the emailed link. */

function mount(path: string, status = 202, ok = true) {
  const calls: { url: string; method: string; body: unknown }[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: init?.body ? JSON.parse(init.body as string) : null })
    return { ok, status, json: async () => null, text: async () => (ok ? '' : 'refused') } as Response
  }))

  return {
    ...render(
      <MemoryRouter initialEntries={[path]}>
        <ResetPassword />
      </MemoryRouter>,
    ),
    calls,
  }
}

describe('demander un lien (pas de token dans l’URL)', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('envoie l’email saisi à /auth/password-reset', async () => {
    const { calls } = mount('/reset-password')
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'quelqu-un@example.com' },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Envoyer le lien' }))

    await waitFor(() => {
      const write = calls.find((c) => c.url.includes('/auth/password-reset') && c.method === 'POST')
      expect(write).toBeTruthy()
      expect(write!.body).toEqual({ email: 'quelqu-un@example.com' })
    })
  })

  it('affiche la même confirmation générique, que le compte existe ou non', async () => {
    // The server itself never says which -- ok:true here stands for either case,
    // since the endpoint always returns 202 regardless of what it found.
    mount('/reset-password')
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'peu-importe@example.com' },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Envoyer le lien' }))

    expect(await screen.findByText('Vérifie ta boîte mail')).toBeTruthy()
  })

  it('affiche la même confirmation même si le serveur ne répond pas', async () => {
    // A network hiccup here must not read as "cet email n'existe pas" -- the
    // request screen never learns enough to say that even on a real failure.
    mount('/reset-password', 500, false)
    fireEvent.change(await screen.findByLabelText('Email'), {
      target: { value: 'peu-importe@example.com' },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Envoyer le lien' }))

    expect(await screen.findByText('Vérifie ta boîte mail')).toBeTruthy()
  })
})

describe('choisir un nouveau mot de passe (token dans l’URL)', () => {
  beforeEach(() => vi.unstubAllGlobals())

  it('envoie le token et le nouveau mot de passe à /auth/password-reset/confirm', async () => {
    const { calls } = mount('/reset-password?token=abc123')
    fireEvent.change(await screen.findByLabelText('Nouveau mot de passe', { exact: false }), {
      target: { value: 'un-mot-de-passe-neuf' },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Choisir ce mot de passe' }))

    await waitFor(() => {
      const write = calls.find((c) => c.url.includes('/auth/password-reset/confirm') && c.method === 'POST')
      expect(write).toBeTruthy()
      expect(write!.body).toEqual({ token: 'abc123', new_password: 'un-mot-de-passe-neuf' })
    })
  })

  it('confirme et propose de se reconnecter une fois le mot de passe changé', async () => {
    mount('/reset-password?token=abc123')
    fireEvent.change(await screen.findByLabelText('Nouveau mot de passe', { exact: false }), {
      target: { value: 'un-mot-de-passe-neuf' },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Choisir ce mot de passe' }))

    expect(await screen.findByText("C'est fait")).toBeTruthy()
    expect(await screen.findByRole('link', { name: 'Se connecter' })).toBeTruthy()
  })

  it('un lien expiré ou déjà utilisé affiche un message spécifique (403)', async () => {
    mount('/reset-password?token=perime', 403, false)
    fireEvent.change(await screen.findByLabelText('Nouveau mot de passe', { exact: false }), {
      target: { value: 'un-mot-de-passe-neuf' },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Choisir ce mot de passe' }))

    expect(
      await screen.findByText("Ce lien n'est plus valable — il a peut-être expiré ou déjà servi."),
    ).toBeTruthy()
  })

  it('un mot de passe trop court désactive le bouton', async () => {
    mount('/reset-password?token=abc123')
    fireEvent.change(await screen.findByLabelText('Nouveau mot de passe', { exact: false }), {
      target: { value: 'court' },
    })
    expect(
      (await screen.findByRole('button', { name: 'Choisir ce mot de passe' }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })
})
