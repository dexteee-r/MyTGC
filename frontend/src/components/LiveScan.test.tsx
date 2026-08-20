import { describe, expect, it } from 'vitest'
import { stillnessGate } from './LiveScan'

/* Reported live: the camera opened and stayed on "garde la main immobile" forever,
   never once sending a frame -- on a device where sensor noise or autofocus hunting
   apparently never let the frame-to-frame diff drop below the movement threshold.
   stillnessGate is the escape hatch: past FORCE_STILL_MS of continuous motion, it
   stops waiting for genuine stillness and lets a frame through anyway. */

describe('stillnessGate', () => {
  it('waits while the view is moving, well under the force threshold', () => {
    const gate = stillnessGate(true, 0, 1000)
    expect(gate.wait).toBe(true)
    expect(gate.movingSince).toBe(1000) // started the clock on this first moving tick
  })

  it('keeps waiting on the next tick, without restarting the clock', () => {
    const gate = stillnessGate(true, 1000, 1200)
    expect(gate.wait).toBe(true)
    expect(gate.movingSince).toBe(1000)
  })

  it('stops waiting the instant the view holds still', () => {
    const gate = stillnessGate(false, 1000, 1200)
    expect(gate.wait).toBe(false)
    // Motion clock cleared: a later bout of movement gets its own fresh countdown
    // rather than inheriting how long this one had already been running.
    expect(gate.movingSince).toBe(0)
  })

  it('stops waiting once continuous motion has run past the force threshold', () => {
    const stillWaiting = stillnessGate(true, 1000, 1000 + 2999)
    expect(stillWaiting.wait).toBe(true)

    const forced = stillnessGate(true, 1000, 1000 + 3000)
    expect(forced.wait).toBe(false)
  })

  it('keeps letting frames through on every later tick once forced, as long as motion continues', () => {
    const forced = stillnessGate(true, 1000, 4000)
    expect(forced.wait).toBe(false)
    // movingSince is untouched while still moving -- next tick reads the same clock
    // and stays forced, rather than re-arming a fresh three-second wait.
    const next = stillnessGate(true, forced.movingSince, 4200)
    expect(next.wait).toBe(false)
  })

  it('a fresh bout of motion after a still moment gets its own three-second countdown', () => {
    const settled = stillnessGate(false, 1000, 4000)
    expect(settled.movingSince).toBe(0)

    const movingAgain = stillnessGate(true, settled.movingSince, 4050)
    expect(movingAgain.wait).toBe(true)
    expect(movingAgain.movingSince).toBe(4050)
  })
})
