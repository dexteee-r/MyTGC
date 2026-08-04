import type { ReactNode } from 'react'
import { COLOR_SWATCHES } from '../lib/types'

export function PageTitle({ children, subtitle }: { children: ReactNode; subtitle?: string }) {
  return (
    <header className="px-5 pt-4 pb-3">
      <h1 className="display-title text-4xl text-crimson">{children}</h1>
      {subtitle && <p className="mt-1 text-ink-soft">{subtitle}</p>}
    </header>
  )
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="px-5 pt-6 pb-3">
      <h2 className="text-xl font-semibold">{children}</h2>
      {hint && <p className="mt-0.5 text-sm text-ink-soft">{hint}</p>}
    </div>
  )
}

/* Every list in the reference has a designed empty state rather than blank space. */
export function EmptyState({
  icon,
  children,
  action,
}: {
  icon: ReactNode
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mx-5 rounded-(--radius-card) bg-sunken px-6 py-10 text-center">
      <div className="mx-auto mb-3 flex size-12 items-center justify-center text-ink-faint">
        {icon}
      </div>
      <p className="text-ink-soft">{children}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string; badge?: number }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex rounded-full bg-sunken p-1">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-full px-4 py-2 text-sm transition ${
              active ? 'bg-surface font-semibold shadow-sm' : 'text-ink-soft'
            }`}
          >
            {option.label}
            {option.badge !== undefined && (
              <span className="ml-1.5 text-ink-faint">{option.badge}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function ColorDots({ colors }: { colors: string[] }) {
  return (
    <span className="inline-flex gap-1">
      {colors.map((color) => (
        <span
          key={color}
          title={color}
          className="size-2.5 rounded-full ring-1 ring-black/10"
          style={{ background: COLOR_SWATCHES[color] ?? '#bbb' }}
        />
      ))}
    </span>
  )
}

export function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/15">
      <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'danger'
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  const styles = {
    primary: 'bg-crimson text-white',
    ghost: 'bg-surface text-ink ring-1 ring-black/10',
    danger: 'bg-crimson-soft text-crimson',
  }[variant]
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-5 py-3 font-semibold transition active:scale-[0.98] disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  )
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div className="size-6 animate-spin rounded-full border-2 border-black/10 border-t-crimson" />
    </div>
  )
}
