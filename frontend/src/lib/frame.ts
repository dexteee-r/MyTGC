/* ── Is there anything in the frame worth sending? ──────────────────────────
   The live scanner sends a frame whenever the view holds still, whether or not a
   card is in front of the lens. Most of a scanning session is the phone pointed at a
   table, a hand, or a lap between two cards, and every one of those frames costs a
   250 KB upload, a detection pass and a hash on the box at home — for a guaranteed
   "rien dans le cadre".

   RECHERCHE-SCAN.md put this first among the cheap wins, and it is deliberately not
   detection: OpenCV in WebAssembly is 3–12 Hz on a phone and this has to run ten
   times a second. It is one statistic over a grid that is already being computed for
   the stillness test.

   A printed card is busy — art, a name plate, a power numeral, a text box — so the
   luminance inside the guide varies a lot. A table, a palm or a carpet does not. The
   threshold is therefore set low enough to only ever reject a genuinely flat view:
   sending a frame that turns out to hold nothing costs one request, but skipping a
   frame that held a card costs the user a scan, and those are not the same mistake. */

/* Rec. 601 luma. The probe is RGBA from a canvas, so this reads one pixel. */
const luma = (data: Uint8ClampedArray, i: number) =>
  0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]

/* Below this standard deviation the view carries no detail worth a round trip.
   Measured on the probe grid, in luminance units out of 255. A blank wall sits near
   zero; a card sits well into the twenties. */
export const FLAT_THRESHOLD = 9

/* The guide rectangle covers the middle of the view, so the corners — which hold the
   table, the edge of a sleeve, whatever is behind — are excluded. Sampling only what
   the user is asked to aim at is what keeps a busy background from reading as a card. */
export function frameDetail(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  inset = 0.18,
): number {
  const x0 = Math.floor(width * inset)
  const x1 = Math.ceil(width * (1 - inset))
  const y0 = Math.floor(height * inset)
  const y1 = Math.ceil(height * (1 - inset))

  let sum = 0
  let squares = 0
  let count = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const value = luma(data, (y * width + x) * 4)
      sum += value
      squares += value * value
      count += 1
    }
  }
  if (count === 0) return 0
  const mean = sum / count
  /* Guarded: floating point can leave the variance a hair below zero when every
     sample is identical, and Math.sqrt of that is NaN — which would compare false
     against the threshold and silently disable the whole gate. */
  return Math.sqrt(Math.max(0, squares / count - mean * mean))
}

export function frameHasSubject(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): boolean {
  return frameDetail(data, width, height) >= FLAT_THRESHOLD
}
