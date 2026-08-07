import type { ReactNode } from 'react'

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
   An empty niche.

   A card that is not held is not its own artwork at low opacity — that shows the
   collector a picture of something they do not have. It is a recess cut in the
   stone with the slot's code chiselled into the floor of it. The gap is what they
   came to look at, and on a wall of them the pattern of holes is the collection.  */
export function EmptyPocket({ code }: { code: string }) {
  return (
    <div className="niche relative flex aspect-[600/838] w-full items-center justify-center px-1">
      <span
        className="t-code text-center leading-relaxed break-all text-carve-dim"
        /* Cut into the floor of the niche rather than printed on it: dark above,
           a hairline of light below. */
        style={{ textShadow: '0 -1px 0 rgba(0,0,0,0.9), 0 1px 0 rgba(255,240,214,0.06)' }}
      >
        {code}
      </span>
    </div>
  )
}

/* Colour is only ever the card's own. Dual-colour cards get both. Squared off and
   inset, so it reads as pigment in a channel rather than as a plastic pill. */
export function ColorBar({ colors, className = '' }: { colors: string[]; className?: string }) {
  const used = colors.length ? colors : ['Black']
  return (
    <span
      className={`flex w-[3px] shrink-0 overflow-hidden rounded-[1px] ${className}`}
      style={{ boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.5)' }}
      aria-hidden
    >
      {used.map((color) => (
        <span
          key={color}
          className="flex-1"
          style={{ background: CARD_COLOR[color] ?? 'var(--color-rail)' }}
        />
      ))}
    </span>
  )
}

export function Screen({ children }: { children: ReactNode }) {
  return <div className="no-scrollbar h-full overflow-y-auto pb-28">{children}</div>
}

/* The head of the slab: the section inscribed in capitals, with a groove cut beneath
   it. The groove is two lines — one dark, one lit — which is the whole engraving
   trick and the reason this reads as carved rather than as a border-bottom. */
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
    <header className="relative px-4 pt-7 pb-4">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="t-inscribed truncate text-[1.45rem] leading-tight">{title}</h1>
          {meta && <p className="t-code pt-2.5">{meta}</p>}
        </div>
        {action}
      </div>
      <Groove />
    </header>
  )
}

/* A cut in the stone. Everywhere a rule is needed. */
export function Groove({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-x-0 bottom-0 block h-px ${className}`}
      style={{
        background: '#050403',
        boxShadow: '0 1px 0 rgba(255,240,214,0.045)',
      }}
    />
  )
}

export function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 pt-8 pb-3">
      <h2 className="t-inscribed text-[0.7rem] text-carve-dim">{children}</h2>
      {aside}
    </div>
  )
}

/* Counts are set like a card's power value, and struck in brass — the one metal on
   the slab. Numbers are the only thing in the interface allowed to be gold; make
   labels gold too and it stops being an accent and becomes a colour scheme. */
export function Tally({ value, of, label }: { value: number; of?: number; label: string }) {
  return (
    <div>
      <p className="t-stat text-[1.9rem] text-brass">
        {value.toLocaleString('fr')}
        {of !== undefined && (
          <span className="text-carve-faint">/{of.toLocaleString('fr')}</span>
        )}
      </p>
      <p className="t-code pt-2">{label}</p>
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
    <div className="niche mx-4 px-5 py-10 text-center">
      <p className="t-inscribed text-[0.8rem]">{title}</p>
      {children && (
        <p className="mx-auto mt-3 max-w-[34ch] text-sm text-carve-dim">{children}</p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  )
}

/* The primary action is a brass plate set into the stone — the one struck surface
   on the screen, and the only thing that could be mistaken for a light source. The
   quiet variants are cut instead of raised, so the hierarchy is depth rather than
   colour, and none of them compete with the six card colours that carry meaning. */
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
  variant?: 'primary' | 'quiet' | 'ghost' | 'danger'
  size?: 'md' | 'lg'
  disabled?: boolean
  full?: boolean
  type?: 'button' | 'submit'
}) {
  const look: Record<string, string> = {
    primary: 'bg-brass text-[#17130a] font-semibold',
    quiet: 'plate text-carve',
    ghost: 'text-carve-dim',
    danger: 'text-ember',
  }
  const carved =
    variant === 'primary'
      ? { boxShadow: 'inset 0 1px 0 rgba(255,246,214,0.45), inset 0 -2px 3px rgba(0,0,0,0.35)' }
      : variant === 'quiet'
        ? undefined
        : { boxShadow: 'var(--groove)' }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={carved}
      className={`inline-flex items-center justify-center gap-2 rounded-[2px] tracking-tight transition-[filter,opacity] hover:brightness-110 active:brightness-95 disabled:opacity-35 ${look[variant]} ${
        size === 'lg' ? 'min-h-[3.25rem] px-6' : 'min-h-11 px-5 text-sm'
      } ${full ? 'w-full' : ''}`}
    >
      {children}
    </button>
  )
}

/* 44px targets: these get hammered while emptying a binder. */
export function Stepper({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (next: number) => void
  disabled?: boolean
}) {
  return (
    <div className="niche flex items-center">
      <button
        onClick={() => onChange(value - 1)}
        disabled={disabled}
        aria-label="Retirer un exemplaire"
        className="size-11 text-lg text-carve-dim disabled:opacity-35"
      >
        −
      </button>
      <span className="t-stat w-8 text-center text-lg text-brass">{value}</span>
      <button
        onClick={() => onChange(value + 1)}
        disabled={disabled}
        aria-label="Ajouter un exemplaire"
        className="size-11 text-lg disabled:opacity-35"
      >
        +
      </button>
    </div>
  )
}

/* Tabs cut into the slab. The selected one is the plate that has been raised out of
   it and lit along its top edge; the others stay sunk. Depth carries the state, so
   nothing has to be painted a brand colour to look chosen. */
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
  return (
    <div role="tablist" aria-label={label} className="wall flex gap-px rounded-[2px] p-px">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            style={active ? { boxShadow: 'var(--relief)' } : { boxShadow: 'var(--groove)' }}
            className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-[1px] px-3 text-sm whitespace-nowrap transition ${
              active ? 'bg-stone-lit font-semibold text-carve' : 'bg-niche text-carve-faint'
            }`}
          >
            {option.label}
            {option.badge !== undefined && (
              <span className="text-carve-faint tabular-nums">{option.badge}</span>
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
      style={{ boxShadow: active ? 'var(--relief)' : 'var(--groove)' }}
      className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-[2px] px-3 text-sm transition ${
        active ? 'bg-stone-lit font-semibold text-carve' : 'bg-niche text-carve-dim'
      }`}
    >
      {swatch && (
        <span
          className="h-3.5 w-[3px] rounded-[1px]"
          style={{
            background: CARD_COLOR[swatch] ?? swatch,
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.5)',
          }}
        />
      )}
      {children}
    </button>
  )
}

/* A Log Pose needle finding its bearing. */
export function Spinner() {
  return (
    <div className="flex justify-center py-14" role="status" aria-label="Chargement">
      <div className="size-4 animate-spin rounded-full border border-[#2a251d] border-t-brass" />
    </div>
  )
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      title="L'API ne répond pas"
      action={
        <Button variant="quiet" onClick={onRetry}>
          Réessayer
        </Button>
      }
    >
      Lance le serveur, puis réessaie.
    </EmptyState>
  )
}
