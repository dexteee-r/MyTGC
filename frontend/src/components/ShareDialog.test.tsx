import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ShareDialog } from './ShareDialog'
import type { ShareStatus } from '../lib/types'

/* The one component both Collection and Wishlist reuse for their share dialog --
   fetch on open, toggle enable/disable, show the link and offer to copy it. Tested
   once here rather than twice per screen, since the logic is identical and only
   the endpoints it is pointed at differ. */

function mount(overrides: {
  fetchStatus?: () => Promise<ShareStatus>
  enable?: () => Promise<ShareStatus>
  disable?: () => Promise<void>
} = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    title: 'Partager ma collection',
    description: 'Un lien en lecture seule.',
    fetchStatus: overrides.fetchStatus ?? (async () => ({ enabled: false, token: null })),
    enable: overrides.enable ?? (async () => ({ enabled: true, token: 'abc123' })),
    disable: overrides.disable ?? (async () => {}),
    publicPath: (token: string) => `/shared/collection/${token}`,
  }
  return { ...render(<ShareDialog {...props} />), props }
}

describe('ShareDialog', () => {
  it('propose d’activer le partage quand il est désactivé', async () => {
    mount()
    expect(await screen.findByText('Activer le partage')).toBeTruthy()
    expect(screen.queryByLabelText('Lien de partage')).toBeNull()
  })

  it('affiche le lien complet une fois le partage activé', async () => {
    const enable = vi.fn(async () => ({ enabled: true, token: 'abc123' }))
    mount({ enable })
    await userEvent.click(await screen.findByText('Activer le partage'))

    await waitFor(() => {
      const field = screen.getByLabelText('Lien de partage') as HTMLInputElement
      expect(field.value).toBe(`${window.location.origin}/shared/collection/abc123`)
    })
    expect(enable).toHaveBeenCalledOnce()
  })

  it('montre le lien déjà actif sans avoir à le réactiver', async () => {
    /* The status the account already has, not a fresh mint -- opening the dialog a
       second time must show the same link, not offer to start over. */
    mount({ fetchStatus: async () => ({ enabled: true, token: 'already-shared' }) })

    const field = (await screen.findByLabelText('Lien de partage')) as HTMLInputElement
    expect(field.value).toContain('already-shared')
    expect(screen.getByText('Désactiver le partage')).toBeTruthy()
  })

  it('désactive le partage et fait disparaître le lien', async () => {
    const disable = vi.fn(async () => {})
    mount({ fetchStatus: async () => ({ enabled: true, token: 'abc123' }), disable })

    await userEvent.click(await screen.findByText('Désactiver le partage'))

    await waitFor(() => expect(screen.queryByLabelText('Lien de partage')).toBeNull())
    expect(disable).toHaveBeenCalledOnce()
  })

  it('copie le lien dans le presse-papier', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    mount({ fetchStatus: async () => ({ enabled: true, token: 'abc123' }) })

    await userEvent.click(await screen.findByText('Copier'))

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/shared/collection/abc123`)
  })
})
