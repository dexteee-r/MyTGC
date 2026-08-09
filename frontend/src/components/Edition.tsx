import type { Language } from '../lib/types'

/* ── Which edition ──────────────────────────────────────────────────────────
   EN and JP printings share their artwork — the recognition work established they
   cannot be told apart from it — so the edition is never inferable from the card in
   front of you. It has to be readable at a glance in every list, and a two-letter
   code in the middle of a line of grey text is not.

   The flag is on the Japanese edition only. "International" is not a country and
   inventing a mark for it would be decoration; the asymmetry is the information —
   a row with a flag is Japanese, a row without is not. One component so the mark
   cannot drift between screens.

   Drawn rather than typed: the emoji flag renders as the letters "JP" on Windows
   and differently again on every other platform, and an SVG stays sharp at any
   density. The red is the flag's own #bc002d; the field is the interface's carved
   off-white rather than pure white, so it sits in the stone instead of glaring. */
export function JapanFlag({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 15 10"
      className={`inline-block h-[0.7em] w-auto shrink-0 align-[-0.04em] ${className}`}
      aria-hidden
    >
      <rect width="15" height="10" rx="0.75" fill="#efe7d9" />
      <circle cx="7.5" cy="5" r="3" fill="#bc002d" />
      <rect
        width="15"
        height="10"
        rx="0.75"
        fill="none"
        stroke="rgba(0,0,0,0.35)"
        strokeWidth="0.6"
      />
    </svg>
  )
}

/* A printing's variant, read off its id: OP01-003 is the base card, OP01-003_p1 is
   the first alternate art, _r1 a reprint. The suffix is the only place this exists —
   there is no version column — so the label is derived rather than stored. */
export function variantOf(cardId: string): string | null {
  const match = /_([a-z])(\d+)$/i.exec(cardId)
  if (!match) return null
  const [, kind, index] = match
  return `${kind.toLowerCase() === 'r' ? 'R' : 'V'}.${index}`
}

/* The label a search result wears: "Ace & Newgate (ST22-001) (V.1)". */
export function printingLabel(name: string, cardId: string): string {
  const variant = variantOf(cardId)
  const base = cardId.replace(/_[a-z]\d+$/i, '')
  return `${name} (${base})${variant ? ` (${variant})` : ''}`
}

const CODE: Record<Language, string> = { en: 'INT', jp: 'JP' }
const NAME: Record<Language, string> = { en: 'International', jp: 'Japon' }

/* The edition as it appears inside a line of metadata: "OP01-001 · 🇯🇵 JP". */
export function Edition({
  language,
  className = '',
}: {
  language: Language
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${className}`}>
      {language === 'jp' && <JapanFlag />}
      <span>{CODE[language]}</span>
      <span className="sr-only">{NAME[language]}</span>
    </span>
  )
}

/* The edition spelled out, for tab labels and prose where there is room for it. */
export function EditionName({ language }: { language: Language }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {language === 'jp' && <JapanFlag />}
      {NAME[language]}
    </span>
  )
}
