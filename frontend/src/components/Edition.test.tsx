import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Edition, EditionName } from './Edition'

/* The two editions are indistinguishable on screen — same artwork, same layout — so
   the mark is the only thing telling them apart in a list. The asymmetry is
   deliberate: a flag means Japanese, no flag means it is not. */

const flagOf = (container: HTMLElement) => container.querySelector('svg')

describe('edition mark', () => {
  it('flies the flag on the Japanese edition', () => {
    const { container } = render(<Edition language="jp" />)
    expect(flagOf(container)).not.toBeNull()
    expect(screen.getByText('JP')).toBeInTheDocument()
  })

  it('leaves the international edition unmarked', () => {
    /* "International" is not a country. Inventing a mark for it would be decoration,
       and would cost the flag the thing that makes it useful — being the exception. */
    const { container } = render(<Edition language="en" />)
    expect(flagOf(container)).toBeNull()
    expect(screen.getByText('INT')).toBeInTheDocument()
  })

  it('names the edition for a screen reader, not just its code', () => {
    render(<Edition language="jp" />)
    expect(screen.getByText('Japon')).toBeInTheDocument()
  })

  it('spells the edition out where there is room', () => {
    const { container } = render(<EditionName language="jp" />)
    expect(flagOf(container)).not.toBeNull()
    expect(screen.getByText('Japon')).toBeInTheDocument()
  })
})
