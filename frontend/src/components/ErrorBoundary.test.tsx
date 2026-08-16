import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

/* A render crash used to take the whole tab blank with nothing to do about it —
   this is the net that catches it. React logs its own noisy warning for an
   uncaught error even when a boundary handles it (it's testing the boundary,
   not the absence of console output), so console.error is spied rather than
   asserted silent. */

function Bomb({ armed }: { armed: boolean }) {
  if (armed) throw new Error('boom')
  return <p>Contenu normal</p>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('affiche ses enfants tant que rien ne plante', () => {
    render(
      <ErrorBoundary>
        <Bomb armed={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Contenu normal')).toBeTruthy()
  })

  it('affiche un écran de repli quand un enfant plante au rendu', () => {
    render(
      <ErrorBoundary>
        <Bomb armed />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Une carte est tombée')).toBeTruthy()
    expect(screen.queryByText('Contenu normal')).toBeNull()
  })

  it('journalise le plantage sans le faire remonter plus haut', () => {
    render(
      <ErrorBoundary>
        <Bomb armed />
      </ErrorBoundary>,
    )
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('a planté'),
      expect.any(Error),
      expect.anything(),
    )
  })

  it('« Réessayer » repart du contenu normal une fois la cause corrigée', () => {
    function Wrapper() {
      const [armed, setArmed] = useState(true)
      return (
        <>
          <button onClick={() => setArmed(false)}>corriger côté test</button>
          <ErrorBoundary>
            <Bomb armed={armed} />
          </ErrorBoundary>
        </>
      )
    }
    render(<Wrapper />)
    expect(screen.getByText('Une carte est tombée')).toBeTruthy()

    // Simulates the underlying condition no longer holding on the next attempt
    // — a transient bad response, say — rather than the same bug retried into
    // the same crash.
    fireEvent.click(screen.getByText('corriger côté test'))
    fireEvent.click(screen.getByText('Réessayer'))

    expect(screen.getByText('Contenu normal')).toBeTruthy()
    expect(screen.queryByText('Une carte est tombée')).toBeNull()
  })
})
