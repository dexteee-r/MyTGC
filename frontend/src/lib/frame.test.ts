import { describe, expect, it } from 'vitest'
import { FLAT_THRESHOLD, frameDetail, frameHasSubject } from './frame'

/* The gate that decides whether a frame is worth a round trip. What is verified here
   is the arithmetic and the direction — a flat view is rejected, a busy one is not.
   The threshold itself was chosen conservatively rather than measured on a phone:
   sending a frame that turns out to be empty costs one request, skipping one that
   held a card costs the user a scan, and those are not the same mistake. */

const W = 40
const H = 56

function canvas(fill: (x: number, y: number) => [number, number, number]) {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = fill(x, y)
      const i = (y * W + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  return data
}

describe('frame gate', () => {
  it('rejects a blank view', () => {
    // A table, a palm, a wall: one colour, no detail.
    const flat = canvas(() => [120, 118, 115])
    expect(frameDetail(flat, W, H)).toBeLessThan(1)
    expect(frameHasSubject(flat, W, H)).toBe(false)
  })

  it('rejects a gentle gradient', () => {
    /* Uneven lighting across a plain surface is the case that would misfire: it is
       not flat, but there is still nothing there. */
    const lit = canvas((_, y) => {
      const v = 90 + (y / H) * 25
      return [v, v, v]
    })
    expect(frameHasSubject(lit, W, H)).toBe(false)
  })

  it('accepts a card-like view', () => {
    // A printed card: a bright panel, a dark text box, a coloured border.
    const card = canvas((x, y) => {
      if (y < H * 0.12) return [220, 40, 50]
      if (y > H * 0.62 && y < H * 0.82) return [30, 28, 26]
      return x % 7 < 3 ? [230, 225, 210] : [150, 140, 120]
    })
    expect(frameDetail(card, W, H)).toBeGreaterThan(FLAT_THRESHOLD)
    expect(frameHasSubject(card, W, H)).toBe(true)
  })

  it('ignores what sits outside the guide', () => {
    /* Only the middle is sampled, so clutter in the corners — the edge of a binder,
       a sleeve — must not read as a card in the frame. */
    const bordered = canvas((x, y) => {
      const clutter = x < W * 0.14 || x > W * 0.86 || y < H * 0.14 || y > H * 0.86
      return clutter ? [255, 0, 0] : [120, 118, 115]
    })
    expect(frameHasSubject(bordered, W, H)).toBe(false)
  })

  it('never returns NaN on a perfectly uniform frame', () => {
    /* Floating point can leave the variance a hair below zero when every sample is
       identical; the square root of that is NaN, which compares false against the
       threshold and would silently disable the gate. */
    const uniform = canvas(() => [0, 0, 0])
    expect(Number.isNaN(frameDetail(uniform, W, H))).toBe(false)
    expect(frameDetail(uniform, W, H)).toBe(0)
  })
})
