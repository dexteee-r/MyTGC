import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { useSkyScroll } from '../App'

const CARD_COLOR: Record<string, string> = {
  Red: 'var(--color-op-red)',
  Green: 'var(--color-op-green)',
  Blue: 'var(--color-op-blue)',
  Purple: 'var(--color-op-purple)',
  Black: 'var(--color-op-black)',
  Yellow: 'var(--color-op-yellow)',
}

export const CARD_COLORS = Object.keys(CARD_COLOR)

/* ── The signature ─────────────────────────────────────────────────────────
   A sunken niche.

   A card that is not held is not its own artwork at low opacity — that shows the
   collector a picture of something they do not have. It is a recess under the water
   with the slot's code on the floor of it. The gap is what they came to look at, and
   across a wall of them the pattern of holes is the collection.                    */
export function EmptyPocket({ code }: { code: string }) {
  return (
    <div className="sunken flex aspect-[600/838] w-full items-center justify-center px-1">
      <span className="t-code text-center leading-relaxed break-all">{code}</span>
    </div>
  )
}

/* Colour is only ever the card's own. Dual-colour cards get both. */
export function ColorBar({ colors, className = '' }: { colors: string[]; className?: string }) {
  const used = colors.length ? colors : ['Black']
  return (
    <span
      /* No width of its own: a caller that wants a horizontal rule under a card name
         cannot win against a hardcoded w-[3px], because two Tailwind utilities of the
         same specificity are settled by stylesheet order and not by class order. */
      className={`flex shrink-0 overflow-hidden rounded-[1px] ${className}`}
      aria-hidden
    >
      {used.map((color) => (
        <span
          key={color}
          className="flex-1"
          style={{ background: CARD_COLOR[color] ?? 'var(--surface-rail)' }}
        />
      ))}
    </span>
  )
}

/* The scrolling surface of a screen. It reports its offset to the sky so the world
   behind moves with the content — the parallax is the whole reason the decor reads
   as a place rather than as wallpaper. */
export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  const report = useSkyScroll()
  return (
    <div
      className={`no-scrollbar h-full overflow-y-auto pb-28 lg:pb-8 ${className}`}
      onScroll={(event) => report(event.currentTarget.scrollTop)}
    >
      {children}
    </div>
  )
}

/* The head of a screen: the metadata line first in mono, then the title large and
   tight. Never carved capitals — the display face does the work. */
export function PageHeader({
  title,
  meta,
  action,
}: {
  title: string
  meta?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="flex items-end justify-between gap-4 px-5 pt-7 pb-4">
      <div className="min-w-0">
        {meta && <p className="t-eyebrow pb-2">{meta}</p>}
        <h1 className="t-display truncate text-[clamp(1.75rem,8vw,2.5rem)]">{title}</h1>
      </div>
      {action}
    </header>
  )
}

export function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-5 pt-7 pb-3">
      <h2 className="t-eyebrow">{children}</h2>
      {aside}
    </div>
  )
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="sunken mx-5 px-5 py-10 text-center">
      <p className="t-eyebrow text-[0.8rem]">{title}</p>
      {children && (
        <p className="mx-auto mt-3 max-w-[38ch] text-sm leading-relaxed text-[var(--text-secondary)]">
          {children}
        </p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  )
}

/* The primary action is a plate of sunlight. The quiet variants sit back in the
   deck, so the hierarchy is light rather than colour, and none of them compete with
   the six card colours that carry meaning. */
export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled,
  full,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'quiet' | 'ghost' | 'danger' | 'destructive'
  size?: 'md' | 'lg'
  disabled?: boolean
  full?: boolean
  type?: 'button' | 'submit'
}) {
  const look: Record<string, CSSProperties> = {
    primary: {
      background: 'var(--gradient-sun)',
      color: 'var(--color-paper-ink)',
      boxShadow: 'var(--shadow-action)',
      fontWeight: 600,
    },
    quiet: { background: 'var(--surface-rail)', color: 'var(--text-primary)' },
    ghost: { background: 'transparent', color: 'var(--text-secondary)' },
    danger: { background: 'transparent', color: 'var(--accent-emitted)' },
    /* Reserved for confirming something irreversible. It is filled, because the
       moment of no return should not look like a link — and it is ember rather than
       gold, because gold is the app saying "do this". */
    destructive: {
      background: 'var(--accent-emitted)',
      color: 'var(--color-paper-100)',
      fontWeight: 600,
    },
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={look[variant]}
      className={`inline-flex min-h-[var(--touch)] items-center justify-center gap-2 rounded-[2px] px-5 whitespace-nowrap transition-[filter,opacity] hover:brightness-110 active:brightness-95 disabled:opacity-35 ${
        size === 'lg' ? 'min-h-[3.25rem] px-6' : 'text-sm'
      } ${full ? 'w-full' : ''}`}
    >
      {children}
    </button>
  )
}

/* 44px targets: these get hammered while emptying a binder. `big` is the card
   screen, where adjusting a count is the most repeated action in the app and gets
   to be thumb-sized. */
export function Stepper({
  value,
  onChange,
  disabled,
  big,
  unit,
}: {
  value: number
  onChange: (next: number) => void
  disabled?: boolean
  big?: boolean
  /* Named under the figure on the big one. "3" alone is a number; "3 exemplaires"
     is a holding, and this control is the whole point of the card screen. */
  unit?: string
}) {
  const round = big ? 'size-[52px] text-2xl' : 'size-[var(--touch)] text-lg'
  /* Big: an outlined ring on the sky rather than a filled key. The figure between
     them is what should carry the weight, and two solid discs out-shout it. */
  const skin = big
    ? { boxShadow: 'inset 0 0 0 1px currentColor' }
    : { background: 'var(--surface-rail)' }

  return (
    <div className={`flex items-center ${big ? 'gap-6' : 'gap-2'}`}>
      <button
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= 0}
        aria-label="Retirer un exemplaire"
        style={skin}
        className={`${round} rounded-full text-[var(--text-primary)] disabled:opacity-35`}
      >
        −
      </button>
      <span className={`text-center ${big ? 'min-w-16' : 'w-8'}`}>
        <span className={`t-numeral block ${big ? 'text-[2.75rem] leading-none' : 'text-xl'}`}>
          {value}
        </span>
        {big && unit && <span className="t-code block pt-1.5">{unit}</span>}
      </span>
      <button
        onClick={() => onChange(value + 1)}
        disabled={disabled}
        aria-label="Ajouter un exemplaire"
        style={skin}
        className={`${round} rounded-full text-[var(--text-primary)] disabled:opacity-35`}
      >
        +
      </button>
    </div>
  )
}

/* A pill on the deck. The chosen one is lit; the others sit in the water.

   Roving tabindex, per the ARIA APG Tabs pattern: only the selected pill is a Tab
   stop, so landing here from outside costs one Tab press regardless of how many
   options exist, and the arrow keys move (and, for a control this immediate,
   select) among the rest -- the same automatic-activation model a native macOS
   or iOS segmented control uses, matching the click handler's own immediate
   effect rather than requiring a separate confirm step arrow-key movement
   would not otherwise have. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: ReactNode; badge?: number }[]
  onChange: (value: T) => void
  label?: string
}) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const current = options.findIndex((option) => option.value === value)
    let next: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (current + 1) % options.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (current - 1 + options.length) % options.length
    } else if (event.key === 'Home') {
      next = 0
    } else if (event.key === 'End') {
      next = options.length - 1
    }
    if (next === null) return
    event.preventDefault()
    onChange(options[next].value)
    const tabs = event.currentTarget
      .closest('[role="tablist"]')
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    tabs?.[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 rounded-full p-1"
      style={{ background: 'var(--surface-recessed)' }}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={onKeyDown}
            style={{
              background: active ? 'var(--color-paper-100)' : 'transparent',
              color: active ? 'var(--color-paper-ink)' : 'var(--text-secondary)',
              fontWeight: active ? 600 : 400,
            }}
            className="inline-flex min-h-[var(--touch)] flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm whitespace-nowrap transition"
          >
            {option.label}
            {option.badge !== undefined && (
              <span className="tabular-nums opacity-60">{option.badge}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Chip({
  active,
  onClick,
  children,
  swatch,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  swatch?: string
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      style={{
        background: active ? 'var(--color-paper-100)' : 'transparent',
        color: active ? 'var(--color-paper-ink)' : 'var(--text-secondary)',
        boxShadow: active ? 'none' : 'inset 0 0 0 1px var(--surface-rail)',
        fontWeight: active ? 600 : 400,
      }}
      className="inline-flex min-h-[var(--touch)] shrink-0 items-center gap-2 rounded-full px-4 text-sm transition"
    >
      {swatch && (
        <span
          className="h-3.5 w-[3px] rounded-[1px]"
          style={{ background: CARD_COLOR[swatch] ?? swatch }}
        />
      )}
      {children}
    </button>
  )
}

/* A deck that rises from the bottom edge and covers the screen while it is open.
   What it holds is secondary to what is behind it, which is why it is a sheet and
   not a permanent strip: a control touched occasionally should not spend the rest
   of the session taking up the space the results need. */
/* Escape-to-close, the scroll lock, and focus management, shared by every
   full-screen overlay. Kept in one place because Sheet and Dialog would otherwise
   drift — one gaining a fix the other never gets, discovered only when whichever
   screen uses the other breaks.

   `aria-modal="true"` on the container is a promise: focus starts inside, Tab
   never reaches the page underneath, and closing gives the trigger its focus
   back. Without this a keyboard user who opens a sheet keeps tabbing through
   whatever the overlay is covering, dimmed but still in the tab order. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]),' +
  ' select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function useOverlayBehavior(
  open: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const container = containerRef.current
      if (!container) return
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      // Wrap at the ends rather than letting Tab escape the overlay -- that
      // escape is exactly what "modal" means to promise and not deliver.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)

    // The container itself, not its first button -- a Sheet's meaningful first
    // stop is its title, read out immediately via aria-label, not whichever
    // control happens to come first in the markup.
    const previouslyFocused = document.activeElement as HTMLElement | null
    containerRef.current?.focus()

    // The page behind must not scroll under the overlay — on a phone that reads as
    // the page having jumped once it closes.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [open, onClose, containerRef])
}

// The theme-isolation variables every overlay's card needs, regardless of where it
// sits on screen: dark ground, cream text, whatever the page under it is doing.
const OVERLAY_THEME = {
  color: 'rgba(243, 230, 203, 1)',
  '--text-primary': 'rgba(243, 230, 203, 1)',
  '--text-secondary': 'rgba(243, 230, 203, 0.55)',
  '--surface-rail': 'rgba(243, 230, 203, 0.12)',
  '--surface-recessed': 'rgba(0, 0, 0, 0.25)',
} as React.CSSProperties

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  useOverlayBehavior(open, onClose, containerRef)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-black/65" />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="hz-enter relative max-h-[82%] overflow-y-auto rounded-t-[22px] pb-[env(safe-area-inset-bottom)] outline-none"
        style={{ background: 'var(--color-sea-900)', boxShadow: 'var(--shadow-deck)', ...OVERLAY_THEME }}
      >
        <header
          className="sticky top-0 z-10 flex items-center justify-between gap-4 px-5 pt-5 pb-3"
          style={{ background: 'var(--color-sea-900)' }}
        >
          <h2 className="t-display text-[1.35rem]">{title}</h2>
          <button 
            onClick={onClose} 
            className="t-code -mr-2 min-h-[var(--touch)] px-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            Fermer
          </button>
        </header>
        <div className="px-5 pb-4">{children}</div>
        {footer && (
          <div
            className="sticky bottom-0 px-5 pt-3 pb-4"
            style={{
              background: 'var(--color-sea-900)',
              boxShadow: '0 -1px 0 var(--surface-rail)',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/* A centred card, not a sheet. Sheet reads as part of the screen it opened from —
   the edge it slides in from is still the screen's own edge, which suits a filter
   panel or an editor that belongs to what is behind it. A short explanation of how
   the whole page works is not part of any one place on it, so it interrupts from the
   middle instead, the way a plain "what is this" dialog does everywhere else. */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  useOverlayBehavior(open, onClose, containerRef)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
      <button aria-label="Fermer" onClick={onClose} className="absolute inset-0 bg-black/65" />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="hz-enter relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-[22px] p-5 outline-none"
        style={{ background: 'var(--color-sea-900)', boxShadow: 'var(--shadow-deck)', ...OVERLAY_THEME }}
      >
        <div className="flex items-center justify-between gap-4 pb-3">
          <h2 className="t-display text-[1.35rem]">{title}</h2>
          <button
            onClick={onClose}
            className="t-code -mr-2 min-h-[var(--touch)] px-2"
            style={{ color: 'var(--text-secondary)' }}
          >
            Fermer
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Spinner() {
  return (
    <div className="flex justify-center py-14" role="status" aria-label="Chargement">
      <div
        className="size-4 rounded-full border-2"
        style={{
          borderColor: 'rgba(243,230,203,.3)',
          borderTopColor: 'var(--accent-numeral)',
          animation: 'hz-spin .8s linear infinite',
        }}
      />
    </div>
  )
}

/* ── The three states the app never had ─────────────────────────────────────── */

/* Lost connection. A collection app runs in a tournament, in a shop, in a convention
   basement — the outage is the common case, not the exception. House rule: never
   announce a failure without saying what still works. The water line breaks and the
   two halves drift apart; that is the only image. */
export function Adrift({
  title = 'Pas de liaison',
  children = 'Ta collection est sur l’appareil, elle reste consultable. Ce sont les nouveautés qui attendent le réseau.',
  onRetry,
  retrying = false,
}: {
  title?: string
  children?: ReactNode
  onRetry?: () => void
  retrying?: boolean
}) {
  return (
    <div role="alert" className="sunken mx-5 px-5 py-9 text-center">
      <svg viewBox="0 0 200 20" width={148} height={15} aria-hidden className="mx-auto mb-6 block overflow-visible">
        <path
          className="hz-part-l"
          d="M2 10h74"
          stroke="rgba(243,230,203,.42)"
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
          style={{ animation: 'hz-part-l 6s ease-in-out infinite' }}
        />
        <path
          className="hz-part-r"
          d="M124 10h74"
          stroke="rgba(243,230,203,.42)"
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
          style={{ animation: 'hz-part-r 6s ease-in-out infinite' }}
        />
      </svg>
      <p className="t-eyebrow text-[0.8rem]">{title}</p>
      <p className="mx-auto mt-3 max-w-[38ch] text-sm leading-relaxed text-[var(--text-secondary)]">
        {children}
      </p>
      {onRetry && (
        <div className="mt-6 flex justify-center">
          <Button variant="quiet" onClick={onRetry} disabled={retrying}>
            {retrying ? 'Reprise de la liaison…' : 'Réessayer'}
          </Button>
        </div>
      )}
    </div>
  )
}

/* A load that drags. A spinner alone lies by omission: after fifteen seconds it says
   exactly what it said at the first. Here the wait speaks — three stages, and from
   the third an exit, without which the screen is a dead end. The sounding lead goes
   down looking for the bottom: the wait itself is the image. */
export function Sounding({
  label = 'Sondage en cours',
  onLeave,
}: {
  label?: string
  onLeave?: () => void
}) {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    const slow = window.setTimeout(() => setStage(1), 4000)
    const stall = window.setTimeout(() => setStage(2), 13000)
    return () => {
      window.clearTimeout(slow)
      window.clearTimeout(stall)
    }
  }, [])
  const note =
    stage === 2
      ? 'Toujours rien remonté. Tu peux repartir, ça finira en arrière-plan.'
      : stage === 1
        ? 'La liaison est lente. Le sondage continue.'
        : null

  return (
    <div role="status" aria-live="polite" className="sunken mx-5 px-5 py-9 text-center">
      <div
        aria-hidden
        className="relative mx-auto mb-5 h-[52px] w-[2px]"
        style={{ background: 'linear-gradient(180deg, rgba(243,230,203,.28), rgba(243,230,203,0))' }}
      >
        <span
          className="hz-plumb-el absolute top-0 left-1/2 h-[13px] w-[9px] -ml-[4.5px]"
          style={{
            borderRadius: '1px 1px 50% 50%',
            background: 'var(--accent-numeral)',
            boxShadow: '0 0 14px 2px rgba(255,200,110,.75)',
            animation: 'hz-plumb 2.6s var(--ease-settle) infinite',
          }}
        />
      </div>
      <p className="t-eyebrow text-[0.8rem]">{label}</p>
      {note && (
        <p className="hz-enter mx-auto mt-3 max-w-[36ch] text-sm leading-relaxed text-[var(--text-secondary)]">
          {note}
        </p>
      )}
      {stage === 2 && onLeave && (
        <div className="hz-enter mt-5 flex justify-center">
          <Button variant="quiet" onClick={onLeave}>
            Continuer sans attendre
          </Button>
        </div>
      )}
    </div>
  )
}

export type ScanFailure = 'light' | 'blur' | 'glare' | 'unknown' | 'none'

const CAUSE: Record<ScanFailure, { title: string; note: string }> = {
  light: {
    title: 'Trop sombre',
    note: "Le viseur n’a pas eu assez de lumière. Rapproche-toi d’une source, ou pose la carte à plat sous une lampe.",
  },
  blur: {
    title: 'Image floue',
    note: "L’appareil n’a pas fait le point. Éloigne la carte d’une main, puis attends la netteté avant de déclencher.",
  },
  glare: {
    title: 'Reflet sur la carte',
    note: "Le brillant renvoie la lumière dans l’objectif. Incline la carte d’une dizaine de degrés pour casser le reflet.",
  },
  unknown: {
    title: 'Carte lue, pas reconnue',
    note: "Le cadre était bon mais ce numéro n’est pas au catalogue. Extension trop récente, promo, ou impression étrangère.",
  },
  none: {
    title: 'Rien à lire dans le cadre',
    note: 'Aucune carte détectée. Cadre-la entière, bords compris, sur un fond uni.',
  },
}

/* A scanner that answers "error" sends the user back to an identical viewfinder
   having taught them nothing. Here the cause becomes an instruction, and manual
   entry stays open: an unreadable card must never be a dead end. That is the one
   non-negotiable rule of this screen. */
export function ScanMiss({
  reason = 'none',
  onRetry,
  onManual,
}: {
  reason?: ScanFailure
  onRetry?: () => void
  onManual?: () => void
}) {
  const cause = CAUSE[reason] ?? CAUSE.none
  return (
    <div role="alert" className="sunken mx-5 px-5 pt-8 pb-7 text-center">
      <svg
        viewBox="0 0 64 64"
        width={54}
        height={54}
        aria-hidden
        className="mx-auto mb-5 block"
        fill="none"
        stroke="rgba(243,230,203,.4)"
        strokeWidth={2.5}
        strokeLinecap="round"
      >
        <path d="M4 20V8a4 4 0 0 1 4-4h12M44 4h12a4 4 0 0 1 4 4v12M60 44v12a4 4 0 0 1-4 4H44M20 60H8a4 4 0 0 1-4-4V44" />
        <path d="M22 42 42 22" stroke="var(--accent-emitted)" strokeWidth={3} />
      </svg>
      <p className="t-eyebrow text-[0.8rem]">{cause.title}</p>
      <p className="mx-auto mt-3 max-w-[38ch] text-sm leading-relaxed text-[var(--text-secondary)]">
        {cause.note}
      </p>
      <div className="mx-auto mt-6 flex max-w-[300px] flex-col gap-2.5">
        {onRetry && (
          <Button full onClick={onRetry}>
            Reprendre le scan
          </Button>
        )}
        {onManual && (
          <button
            onClick={onManual}
            className="min-h-[var(--touch)] text-sm text-[var(--text-secondary)] underline underline-offset-4"
          >
            Chercher la carte à la main
          </button>
        )}
      </div>
    </div>
  )
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return <Adrift onRetry={onRetry} />
}
