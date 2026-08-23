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

  it('reste fixe pendant le défilement -- le ciel dessiné, lui, suit en parallaxe', () => {
    // The whole decorative layer is bounded to one viewport height. A flat
    // gradient still reads fine past its own lower edge once translated by
    // the parallax factor, but a finite photo does not -- on a page that
    // scrolls past one screen (the want list can run to dozens of posters),
    // the image's own bottom edge would rise above the viewport and expose a
    // bare seam where the picture just stops. This is the regression that
    // actually shipped, reported live on the wanted-poster backdrop.
    const withImage = render(<Sky variant="paper" image="/bg.jpg" scrollY={400} />)
    const imageLayer = withImage.container.firstElementChild as HTMLElement
    expect(imageLayer.style.transform).toBe('')

    const withoutImage = render(<Sky variant="dusk" scrollY={400} />)
    const drawnLayer = withoutImage.container.firstElementChild as HTMLElement
    expect(drawnLayer.style.transform).toContain('translateY(-88px)')
  })

  it('montre la photo entière (contain) plutôt qu’en couper la plus grande part (cover)', () => {
    // Reported live: this photo is a landscape collage (~1.22:1), wider than
    // the tall, narrow viewport most people actually open the app in. cover
    // would fill that shape by scaling the image up until its height matches
    // the screen, cropping away most of its width in the process -- what
    // showed up as "only ever a thin slice of the picture". contain keeps the
    // whole photo in frame, letterboxed in the same cream the paper page
    // already runs on rather than the sea-night `body` default.
    const { container } = render(<Sky variant="paper" image="/bg.jpg" />)
    const img = container.querySelector('img')!
    expect(img.className).toContain('object-contain')
    expect(img.className).not.toContain('object-cover')
    expect((img.parentElement as HTMLElement).style.backgroundColor).toBe('var(--color-paper-100)')
  })
})
