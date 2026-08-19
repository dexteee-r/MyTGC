import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Dialog, Segmented, Sheet } from './ui'

/* aria-modal="true" is a promise: focus starts inside the overlay, Tab never
   reaches the page underneath, and closing gives the trigger its focus back.
   Tested once here rather than per page, since every screen that opens a Sheet
   or a Dialog gets this behaviour from the same shared hook. */

function SheetHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Ouvrir</button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Filtres">
        <button>Premier</button>
        <button>Second</button>
      </Sheet>
    </>
  )
}

function DialogHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>Ouvrir</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Comment ça marche">
        <button>Premier</button>
        <button>Second</button>
      </Dialog>
    </>
  )
}

describe('Sheet — gestion du focus', () => {
  it('déplace le focus dans la fenêtre à son ouverture', () => {
    render(<SheetHarness />)
    fireEvent.click(screen.getByText('Ouvrir'))
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })

  it('restitue le focus au déclencheur à la fermeture', () => {
    render(<SheetHarness />)
    const trigger = screen.getByText('Ouvrir')
    // jsdom, unlike a real browser, does not focus a button on click -- focus it
    // first so the effect captures the same element a real click would leave
    // focused.
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.activeElement).toBe(trigger)
  })

  it('Tab depuis le dernier élément revient au premier, sans sortir vers la page', () => {
    // DOM order inside the overlay: "Fermer" (the header's own close button)
    // leads, "Second" trails -- the harness adds no footer to push it further.
    render(<SheetHarness />)
    fireEvent.click(screen.getByText('Ouvrir'))
    const first = screen.getByText('Fermer')
    const last = screen.getByText('Second')
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
  })

  it('Maj+Tab depuis le premier élément revient au dernier', () => {
    render(<SheetHarness />)
    fireEvent.click(screen.getByText('Ouvrir'))
    const first = screen.getByText('Fermer')
    const last = screen.getByText('Second')
    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })
})

describe('Dialog — gestion du focus', () => {
  it('déplace le focus dans la fenêtre à son ouverture', () => {
    render(<DialogHarness />)
    fireEvent.click(screen.getByText('Ouvrir'))
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })

  it('restitue le focus au déclencheur à la fermeture', () => {
    render(<DialogHarness />)
    const trigger = screen.getByText('Ouvrir')
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(document.activeElement).toBe(trigger)
  })
})

/* Roving tabindex, per the ARIA APG Tabs pattern: only the selected pill is a Tab
   stop, and the arrow keys move -- and, for a control this immediate, select --
   among the rest, the same automatic-activation model a native segmented control
   uses. */
function SegmentedHarness() {
  const [value, setValue] = useState('a')
  return (
    <Segmented
      value={value}
      options={[
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
        { value: 'c', label: 'C' },
      ]}
      onChange={setValue}
      label="Lettres"
    />
  )
}

describe('Segmented — navigation au clavier', () => {
  it('seul l’onglet actif est un arrêt de tabulation', () => {
    render(<SegmentedHarness />)
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('tab', { name: 'C' })).toHaveAttribute('tabindex', '-1')
  })

  it('flèche droite avance et sélectionne, en bouclant après le dernier', () => {
    render(<SegmentedHarness />)
    const a = screen.getByRole('tab', { name: 'A' })
    a.focus()
    fireEvent.keyDown(a, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'B' }))

    fireEvent.keyDown(screen.getByRole('tab', { name: 'B' }), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByRole('tab', { name: 'C' }), { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('aria-selected', 'true')
  })

  it('flèche gauche recule, en bouclant avant le premier', () => {
    render(<SegmentedHarness />)
    const a = screen.getByRole('tab', { name: 'A' })
    a.focus()
    fireEvent.keyDown(a, { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'C' })).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'C' }))
  })

  it('Fin sélectionne directement le dernier onglet', () => {
    render(<SegmentedHarness />)
    const a = screen.getByRole('tab', { name: 'A' })
    a.focus()
    fireEvent.keyDown(a, { key: 'End' })
    expect(screen.getByRole('tab', { name: 'C' })).toHaveAttribute('aria-selected', 'true')
  })
})
