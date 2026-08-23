import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Sky } from './Sky'

/* Sky.tsx states its own rule in a comment: everything is drawn -- gradients and
   SVG -- because no copyrighted image can enter the repository. `image` is the one
   deliberate exception, for a photo served from the backend's gitignored media
   directory rather than bundled into the repo (see Wishlist.tsx's own comment on
   its wanted-poster backdrop). These tests cover the fallback that keeps a missing
   file from ever showing a blank rectangle, and that the drawn decor (waves) steps
   aside rather than fighting a real photo for the same pixels. */

describe('l’image de fond de Sky', () => {
  it('affiche l’image fournie plutôt que le ciel dessiné', () => {
    const { container } = render(<Sky variant="paper" image="/bg.jpg" />)
    const img = container.querySelector('img')
    expect(img?.getAttribute('src')).toBe('/bg.jpg')
  })

  it('revient au ciel dessiné si l’image échoue à charger', () => {
    const { container } = render(<Sky variant="paper" image="/introuvable.jpg" />)
    const img = container.querySelector('img')!
    fireEvent.error(img)

    expect(container.querySelector('img')).toBeNull()
  })

  it('aucune vague ni aucun décor animé quand une image de fond est affichée', () => {
    // dusk normally draws waves (svg) and a sun disc -- deliberately not the
    // paper variant here, to isolate "image suppresses the drawn decor" from
    // "paper never had waves to begin with".
    const { container } = render(<Sky variant="dusk" image="/bg.jpg" />)
    expect(container.querySelectorAll('svg').length).toBe(0)
  })

  it('sans image, le ciel dessiné et ses vagues reviennent normalement', () => {
    const { container } = render(<Sky variant="dusk" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0)
  })
})
