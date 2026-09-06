import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../lib/auth'
import { SignIn } from './SignIn'

/* The submit button used to stay disabled while the password was too short, which
   hides the button rather than explaining anything -- a control nobody can press
   gives no reason why. It is always pressable now; a too-short password is caught
   on submit and shown as the same inline error every other rejection here uses. */

function mount() {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    if (url.includes('/auth/registration')) {
      return {
        ok: true, status: 200, text: async () => '',
        json: async () => ({ mode: 'open', first_account: false }),
      } as Response
    }
    // Sign-in's own refresh boot, and anything a submission would hit -- none of
    // these tests let a submission reach that far.
    return { ok: false, status: 401, json: async () => ({ detail: 'nope' }), text: async () => '' } as Response
  }))

  return {
    ...render(
      <MemoryRouter>
        <AuthProvider>
          <SignIn />
        </AuthProvider>
      </MemoryRouter>,
    ),
    calls,
  }
}

const switchToSignUp = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /Pas encore de compte/ }))
}

describe('validation du mot de passe à la création de compte', () => {
  beforeEach(() => vi.unstubAllGlobals())

  // The password field's <label> wraps a reveal/hide button alongside the input
  // (for the eye icon), and Testing Library's implicit-label matching does not
  // resolve to the input when a label wraps more than one focusable control --
  // a plain CSS query sidesteps that rather than fighting the query engine over it.
  const passwordField = (container: HTMLElement) =>
    container.querySelector('input[type="password"]') as HTMLInputElement

  it('le bouton reste cliquable même si le mot de passe est trop court', async () => {
    const { container } = mount()
    await switchToSignUp()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(passwordField(container), { target: { value: 'court' } })

    expect(screen.getByRole('button', { name: 'Créer le compte' })).not.toBeDisabled()
  })

  it('affiche un message et n’appelle pas le serveur quand le mot de passe est trop court', async () => {
    const { container, calls } = mount()
    await switchToSignUp()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(passwordField(container), { target: { value: 'court' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer le compte' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('10 caractères minimum')
    expect(calls.some((c) => c.includes('/auth/register'))).toBe(false)
  })

  it('soumet normalement une fois le mot de passe assez long', async () => {
    const { container, calls } = mount()
    await switchToSignUp()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(passwordField(container), { target: { value: 'un-mot-de-passe-correct' } })
    fireEvent.click(screen.getByRole('button', { name: 'Créer le compte' }))

    await screen.findByRole('alert')
    expect(calls.some((c) => c.includes('/auth/register'))).toBe(true)
  })
})
