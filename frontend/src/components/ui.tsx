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
   Set completion as a ring with cardinal ticks. A collector's real question is
   never "how many cards do I have" but "how close is this set". A progress bar
   answers it flatly; a ring reads at a glance in a grid, and the four ticks are
   a log pose — the instrument this game's whole world is organised around.
   It turns gold only when the set is finished, which is the one moment worth
   marking.                                                                     */
export function CompletionRing({
  value,
  total,
  size = 46,
}: {
  value: number
  total: number
  size?: number
}) {
  const pct = total > 0 ? Math.min(1, value / total) : 0
  const complete = pct >= 1
  const r = size / 2 - 4
  const circumference = 2 * Math.PI * r
  const center = size / 2

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${value} sur ${total}`}
      className="shrink-0"
    >
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke="var(--color-line)"
        strokeWidth="2.5"
      />
      {[0, 90, 180, 270].map((angle) => (
        <line
          key={angle}
          x1={center}
          y1={2}
          x2={center}
          y2={5.5}
          stroke="var(--color-line)"
          strokeWidth="1.5"
          transform={`rotate(${angle} ${center} ${center})`}
        />
      ))}
      {pct > 0 && (
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={complete ? 'var(--color-gold)' : 'var(--color-foam)'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${circumference * pct} ${circumference}`}
          transform={`rotate(-90 ${center} ${center})`}
        />
      )}
      <text
        x={center}
        y={center + 3.5}
        textAnchor="middle"
        className="voice-data"
        fontSize="10.5"
        fontWeight="700"
        fill={complete ? 'var(--color-gold)' : 'var(--color-foam-dim)'}
      >
        {Math.round(pct * 100)}
      </text>
    </svg>
  )
}

/* The systemic device: every card carries its printed colours as a spine. Dual
   colour cards split it. Six colours is the axis this game is built on, so the
   spine is information the collector already thinks in. */
export function ColorSpine({
  colors,
  className = '',
}: {
  colors: string[]
  className?: string
}) {
  const used = colors.length ? colors : ['Black']
  return (
    <span
      className={`flex w-[3px] shrink-0 overflow-hidden rounded-full ${className}`}
      aria-hidden
    >
      {used.map((color) => (
        <span
          key={color}
          className="flex-1"
          style={{ background: CARD_COLOR[color] ?? 'var(--color-line)' }}
        />
      ))}
    </span>
  )
}

export function ColorDots({ colors }: { colors: string[] }) {
  return (
    <span className="inline-flex gap-1">
      {colors.map((color) => (
        <span
          key={color}
          title={color}
          className="size-2.5 rounded-full"
          style={{ background: CARD_COLOR[color] ?? 'var(--color-line)' }}
        />
      ))}
    </span>
  )
}

export function Screen({ children }: { children: ReactNode }) {
  return <div className="no-scrollbar h-full overflow-y-auto pb-32">{children}</div>
}

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
    <header className="flex items-end justify-between gap-3 px-5 pt-5 pb-4">
      <div className="min-w-0">
        {meta && <p className="voice-label pb-1.5">{meta}</p>}
        <h1 className="voice-display truncate text-[2rem]">{title}</h1>
      </div>
      {action}
    </header>
  )
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-5 pt-7 pb-3">
      <h2 className="voice-label">{children}</h2>
      {aside}
    </div>
  )
}

/* An empty screen is an invitation to act, so it always carries the next step
   rather than only stating the absence. */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mx-5 rounded-(--radius-card) border border-line/60 px-6 py-9 text-center">
      {icon && (
        <div className="mx-auto mb-3 flex size-10 items-center justify-center text-foam-faint">
          {icon}
        </div>
      )}
      <p className="font-semibold">{title}</p>
      {children && <p className="mt-1.5 text-sm text-foam-dim">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

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
  variant?: 'primary' | 'quiet' | 'ghost'
  size?: 'md' | 'lg'
  disabled?: boolean
  full?: boolean
  type?: 'button' | 'submit'
}) {
  const look = {
    primary: 'bg-signal text-white',
    quiet: 'bg-sea-high text-foam',
    ghost: 'border border-line text-foam-dim',
  }[variant]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-full font-semibold transition active:scale-[0.98] disabled:opacity-40 ${look} ${
        size === 'lg' ? 'min-h-[3.25rem] px-6 text-[0.95rem]' : 'min-h-11 px-5 text-sm'
      } ${full ? 'w-full' : ''}`}
    >
      {children}
    </button>
  )
}

/* 44px minimum touch target: these get hammered repeatedly while emptying a
   binder, and a 32px control misses under a thumb. */
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
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(value - 1)}
        disabled={disabled}
        aria-label="Retirer un exemplaire"
        className="size-11 rounded-full bg-sea-high text-lg font-semibold text-foam-dim active:scale-95 disabled:opacity-40"
      >
        −
      </button>
      <span className="voice-data w-7 text-center text-base font-bold">{value}</span>
      <button
        onClick={() => onChange(value + 1)}
        disabled={disabled}
        aria-label="Ajouter un exemplaire"
        className="size-11 rounded-full bg-sea-high text-lg font-semibold text-foam active:scale-95 disabled:opacity-40"
      >
        +
      </button>
    </div>
  )
}

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
    <div role="tablist" aria-label={label} className="inline-flex rounded-full bg-sea-raised p-1">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={`min-h-9 rounded-full px-3.5 text-sm transition ${
              active ? 'bg-sea-high font-semibold text-foam' : 'text-foam-faint'
            }`}
          >
            {option.label}
            {option.badge !== undefined && (
              <span className="voice-data ml-1.5 text-foam-faint">{option.badge}</span>
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
      className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition ${
        active
          ? 'border-foam bg-foam font-semibold text-sea'
          : 'border-line text-foam-dim'
      }`}
    >
      {swatch && (
        <span
          className="size-2.5 rounded-full"
          style={{ background: CARD_COLOR[swatch] ?? swatch }}
        />
      )}
      {children}
    </button>
  )
}

export function Spinner() {
  return (
    <div className="flex justify-center py-12" role="status" aria-label="Chargement">
      <div className="size-5 animate-spin rounded-full border-2 border-line border-t-foam" />
    </div>
  )
}

/* Failure states say what happened and what to do, in the interface's voice. */
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
