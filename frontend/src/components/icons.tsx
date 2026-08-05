/* Inline so the app ships no icon font and works offline. Stroked, 24px grid,
   matching the light line weight of the reference screenshots. */
const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
}

export function HomeIcon(props: { className?: string }) {
  return (
    <svg {...base} {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
    </svg>
  )
}

export function LayersIcon(props: { className?: string }) {
  return (
    <svg {...base} {...props}>
      <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
      <path d="m3 12.5 9 4.5 9-4.5" />
      <path d="m3 16.8 9 4.5 9-4.5" />
    </svg>
  )
}

export function SearchIcon(props: { className?: string }) {
  return (
    <svg {...base} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

export function BoxIcon(props: { className?: string }) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="7.5" width="18" height="13" rx="2.5" />
      <path d="M6 4.5h12" />
    </svg>
  )
}

export function ChevronLeftIcon(props: { className?: string }) {
  return (
    <svg {...base} {...props}>
      <path d="m14.5 5-7 7 7 7" />
    </svg>
  )
}

export function TrendIcon(props: { className?: string }) {
  return (
    <svg {...base} {...props}>
      <path d="m3 16 5.5-6 4 4L21 6" />
      <path d="M16 6h5v5" />
    </svg>
  )
}

export function CameraOffIcon(props: { className?: string }) {
  return (
    <svg {...base} {...props}>
      <path d="M3 8.5A2 2 0 0 1 5 6.5h2.2l1.3-2h7l1.3 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <path d="m4 4 16 16" />
    </svg>
  )
}

export function PlusIcon(props: { className?: string }) {
  return (
    <svg {...base} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function CameraIcon(props: { className?: string }) {
  return (
    <svg {...base} {...props}>
      <path d="M3 8.5A2 2 0 0 1 5 6.5h2.2l1.3-2h7l1.3 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      <circle cx="12" cy="13" r="3.6" />
    </svg>
  )
}
