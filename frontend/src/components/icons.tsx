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

/* ── Onglets : objets du monde One Piece ───────────────────────────────────
   Chaque onglet porte l'objet qui correspond à sa fonction, pas une métaphore
   décorative : la boussole sert à viser, le journal de bord consigne ce qu'on a
   ramené, la carte marine montre les territoires. Dessinés au même trait que le
   reste (grille 24, 1.7px, bouts ronds) pour rester lisibles à 22px.          */

export function StrawHatIcon(props: { className?: string }) {
  return (
    <svg {...base} {...props}>
      <path d="M3.2 14.4c0-1.3 2-2.2 4.9-2.6.1-4.4 1.5-6.4 3.9-6.4s3.8 2 3.9 6.4c2.9.4 4.9 1.3 4.9 2.6 0 1.7-3.9 2.9-8.8 2.9s-8.8-1.2-8.8-2.9Z" />
      <path d="M8.1 11.8c2.5.7 5.3.7 7.8 0" />
    </svg>
  )
}

export function SeaChartIcon(props: { className?: string }) {
  return (
    <svg {...base} {...props}>
      <path d="M3 6.6 9 4l6 2.8 6-2.6v13.2L15 20l-6-2.8L3 19.8Z" />
      <path d="M9 4v13.2M15 6.8V20" />
    </svg>
  )
}

export function LogPoseIcon(props: { className?: string }) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="7.4" />
      <path d="M12 2.6v2.2" />
      <path d="m8.9 15.1 6.2-6.2" />
      <path d="M15.1 8.9v3.1h-3.1" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ShipLogIcon(props: { className?: string }) {
  return (
    <svg {...base} {...props}>
      <path d="M8.2 3.5h9.3a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H8.2" />
      <path d="M8.2 3.5A2.6 2.6 0 0 0 5.6 6.1v11.8a2.6 2.6 0 0 0 2.6 2.6" />
      <path d="M8.2 16.4H5.9" />
      <path d="M15.1 3.5v6.2l-2-1.5-2 1.5V3.5" />
    </svg>
  )
}

export function NewsIcon(props: { className?: string }) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5.6h12.4a1.4 1.4 0 0 1 1.4 1.4v10.4a2 2 0 0 0 2 2H5.4A1.4 1.4 0 0 1 4 18Z" />
      <path d="M17.8 9.2h1.2A1.4 1.4 0 0 1 20.4 10.6v6.8" />
      <path d="M6.8 9.1h7.6M6.8 12.4h7.6M6.8 15.7h4.6" />
    </svg>
  )
}
