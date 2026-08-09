import { useEffect, useState } from 'react'
import { usePrefersReducedMotion } from './Sky'

/* ── The moment ─────────────────────────────────────────────────────────────
   A card going into the collection is the one genuinely satisfying event in the
   app, and it used to produce a toast. It gets five registers instead, because the
   variety is what makes the gesture satisfying — not the effect.

   If everything is a moment then nothing is: a duplicate gets a ripple and no more.
   The burst is the speed lines of a manga panel, and it fires on the thing that
   actually happened, once.                                                         */

export type MomentKind = 'new' | 'rare' | 'duplicate' | 'first' | 'complete'

/* Ordered by how notable the event is: completing a set outranks the card being
   rare, which outranks it merely being new. */
export function momentLine(kind: MomentKind, facts: {
  name: string
  rarity?: string | null
  packCode?: string | null
  packSize?: number
  had?: number
}): string {
  switch (kind) {
    case 'complete':
      return `${facts.packCode} est complète. ${facts.packSize} sur ${facts.packSize}.`
    case 'first':
      return `La première carte de ${facts.packCode}.`
    case 'rare':
      return `${facts.rarity}. Nouvelle dans ta collection.`
    case 'duplicate':
      return `Tu en avais déjà ${facts.had}. Ce sera le ${(facts.had ?? 0) + 1}e.`
    default:
      return 'Nouvelle dans ta collection.'
  }
}

export function Moment({
  kind,
  line,
  trigger,
  onDone,
}: {
  kind: MomentKind
  line: string
  /* Bumped on every add, so scanning the same card twice in a row still fires. */
  trigger: number
  onDone: () => void
}) {
  const reduced = usePrefersReducedMotion()
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (!trigger) return
    setShown(trigger)
    const timer = window.setTimeout(onDone, kind === 'duplicate' ? 1400 : 1900)
    return () => window.clearTimeout(timer)
  }, [trigger, kind, onDone])

  if (!shown) return null

  const quiet = kind === 'duplicate'

  return (
    <div
      key={shown}
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center"
    >
      {!quiet && !reduced && (
        <>
          {/* Speed lines. A conic gradient of hard stops is a manga panel's burst
              and costs one element, where a sprite sheet would cost a download. */}
          <span
            aria-hidden
            className="absolute size-[420px] rounded-full"
            style={{
              background:
                'conic-gradient(from 0deg, rgba(255,214,150,.85) 0 2deg, transparent 2deg 9deg, rgba(255,214,150,.5) 9deg 10deg, transparent 10deg 21deg)',
              maskImage: 'radial-gradient(circle, transparent 26%, #000 46%, transparent 74%)',
              WebkitMaskImage:
                'radial-gradient(circle, transparent 26%, #000 46%, transparent 74%)',
              animation: 'hz-rays .9s var(--ease-settle) both',
            }}
          />
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 45%, rgba(255,214,150,.28), transparent 55%)',
              animation: 'hz-flash .9s ease-out both',
            }}
          />
        </>
      )}

      {/* A duplicate gets this and nothing else: one ring going out, no fanfare. */}
      {quiet && !reduced && (
        <span
          aria-hidden
          className="absolute size-24 rounded-full"
          style={{
            border: '2px solid rgba(255,214,150,.6)',
            animation: 'hz-ripple 1.1s ease-out both',
          }}
        />
      )}

      <p
        className="hz-enter mx-8 max-w-[26ch] rounded-full px-5 py-3 text-center text-[1.05rem] leading-snug font-semibold"
        style={{
          background: 'rgba(4,18,26,.82)',
          color: 'var(--color-paper-100)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          boxShadow: '0 10px 30px rgba(0,0,0,.45)',
        }}
      >
        {line}
      </p>
    </div>
  )
}
