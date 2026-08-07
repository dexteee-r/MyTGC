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
   An empty pocket.

   A card that is not held used to render as its own artwork at low opacity, which
   showed the collector a picture of something they do not have. A binder does not
   do that: it shows a hole, with the slot's number in the well. The gap is what
   they came to look at.                                                          */
export function EmptyPocket({ code }: { code: string }) {
  return (
    <div className="pocket flex aspect-[600/838] w-full items-center justify-center px-1">
      <span className="t-code text-center leading-relaxed break-all opacity-55">
        {code}
      </span>
    </div>
  )
}

/* Colour is only ever the card's own. Dual-colour cards get both. */
export function ColorBar({ colors, className = '' }: { colors: string[]; className?: string }) {
  const used = colors.length ? colors : ['Black']
  return (
    <span className={`flex overflow-hidden rounded-full ${className}`} aria-hidden>
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

/* A page header reads like a binder's divider: what section this is, and how full
   it is, in the same small stamped type the cards use for their number. */
export function PageHeader({
  title,
  meta,
  action,
}: {
  title: string
  meta?: string
  action?: ReactNode
}) {
  return (
    <header className="flex items-end justify-between gap-4 border-b border-rail px-4 pt-6 pb-4">
      <div className="min-w-0">
        <h1 className="t-stat truncate text-[2.1rem]">{title}</h1>
        {meta && <p className="t-code pt-2">{meta}</p>}
      </div>
      {action}
    </header>
  )
}

export function SectionLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pt-7 pb-3">
      <h2 className="t-code">{children}</h2>
      {aside}
    </div>
  )
}

/* Counts are set like a card's power: large, heavy, tight, tabular. It is the one
   place the interface raises its voice, and it does so in the game's own idiom. */
export function Tally({ value, of, label }: { value: number; of?: number; label: string }) {
  return (
    <div>
      <p className="t-stat text-[1.75rem]">
        {value}
        {of !== undefined && <span className="text-label-faint">/{of}</span>}
      </p>
      <p className="t-code pt-1.5">{label}</p>
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
    <div className="mx-4 border border-dashed border-rail px-5 py-10 text-center">
      <p className="t-plate">{title}</p>
      {children && <p className="mt-2 text-sm text-label-dim">{children}</p>}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  )
}

/* No brand colour: the primary action is the card's white border on the binder's
   black. A coloured button would compete with the six colours that carry meaning. */
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
  const look = {
    primary: 'bg-label text-ink',
    quiet: 'bg-pocket text-label ring-1 ring-rail',
    ghost: 'text-label-dim ring-1 ring-rail',
    danger: 'text-alert ring-1 ring-alert/40',
  }[variant]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-sm font-semibold tracking-tight transition disabled:opacity-35 ${look} ${
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
    <div className="flex items-center ring-1 ring-rail">
      <button
        onClick={() => onChange(value - 1)}
        disabled={disabled}
        aria-label="Retirer un exemplaire"
        className="size-11 text-lg text-label-dim disabled:opacity-35"
      >
        −
      </button>
      <span className="t-stat w-8 text-center text-lg">{value}</span>
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

/* Divider tabs, like the labelled dividers in a binder — squared off, flush, the
   active one marked by a rule along its top edge. Deliberately not a floating pill. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string; badge?: number }[]
  onChange: (value: T) => void
  label?: string
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-px bg-rail">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`min-h-10 flex-1 border-t-2 px-3 text-sm whitespace-nowrap transition ${
              active
                ? 'border-label bg-pocket font-semibold text-label'
                : 'border-transparent bg-ink text-label-faint'
            }`}
          >
            {option.label}
            {option.badge !== undefined && (
              <span className="ml-1.5 text-label-faint tabular-nums">{option.badge}</span>
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
      className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-sm px-3 text-sm transition ${
        active ? 'bg-label font-semibold text-ink' : 'text-label-dim ring-1 ring-rail'
      }`}
    >
      {swatch && (
        <span
          className="h-3.5 w-1"
          style={{ background: CARD_COLOR[swatch] ?? swatch }}
        />
      )}
      {children}
    </button>
  )
}

export function Spinner() {
  return (
    <div className="flex justify-center py-14" role="status" aria-label="Chargement">
      <div className="size-4 animate-spin rounded-full border border-rail border-t-label" />
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
