import { useMemo, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'

/* ── The place ──────────────────────────────────────────────────────────────
   The background of every screen. Each screen has its hour, which is what gives the
   app its change of value and temperature from tab to tab without a single content
   component changing.

   Everything is drawn — gradients and SVG — because no copyrighted image can enter
   the repository. That is also what stays sharp at any pixel density, which a
   scaled-up JPEG does not.                                                        */

export type SkyVariant = 'dusk' | 'dawn' | 'day' | 'night' | 'deep' | 'paper' | 'mist'

const SKY: Record<SkyVariant, string> = {
  dusk: 'linear-gradient(180deg, #2a2044 0%, #7d3a52 11%, #c25a2c 21%, #f0a04a 27%, #f9cd83 30.5%, #14454f 31%, #0a2833 42%, #06171d 100%)',
  dawn: 'linear-gradient(180deg, #123049 0%, #35748c 14%, #8fc0b4 25%, #f3dda8 30.5%, #14454f 31%, #0a2833 44%, #06171d 100%)',
  day: 'linear-gradient(180deg, #1a5f86 0%, #3f9ab5 16%, #a9d8d6 28%, #cfeae4 30.5%, #14454f 31%, #0a2833 44%, #06171d 100%)',
  night:
    'linear-gradient(180deg, #050914 0%, #0d1b34 18%, #16385a 29%, #0d2b3d 31%, #07202a 44%, #04121a 100%)',
  deep: 'linear-gradient(180deg, #071c26 0%, #06171d 55%, #04121a 100%)',
  paper: 'linear-gradient(180deg, #efe0c0 0%, #e3d0aa 60%, #d3bd93 100%)',
  /* Mist: the white sky of a sky island. Reserved for the scanner — it is the one
     screen that asks for precision, and on a pale ground the viewfinder becomes the
     only dark surface, which is where the eye goes. */
  mist: 'linear-gradient(180deg, #eef3f2 0%, #dbe6e6 34%, #bccdd1 62%, #93a8b0 100%)',
}

const SUN: Partial<Record<SkyVariant, { top: string; size: number; op: number }>> = {
  dusk: { top: '14.5%', size: 205, op: 1 },
  dawn: { top: '17%', size: 140, op: 0.9 },
  day: { top: '3%', size: 96, op: 0.6 },
}

const WAVE_TINT: Record<string, [string, string, string]> = {
  paper: ['rgba(186,166,128,.6)', 'rgba(150,130,96,.8)', '#7d6a48'],
  night: ['rgba(30,74,102,.7)', 'rgba(14,48,68,.9)', '#061a26'],
  mist: ['rgba(147,168,176,.6)', 'rgba(120,142,150,.85)', '#7d949c'],
  default: ['rgba(44,116,124,.72)', 'rgba(20,69,79,.9)', '#08222c'],
}

/* Three genuinely different curves, not one curve at three offsets: distinct
   amplitudes and wavelengths, on periods that are coprime (19 / 29 / 43s) so they
   never realign. A single repeated curve gets unmasked by the eye in two seconds. */
const WAVE_PATHS = [
  'M0,88 C160,70 300,104 460,88 C620,72 760,102 920,86 C1080,70 1250,100 1440,84 L1440,200 L0,200 Z',
  'M0,92 C110,112 210,74 330,94 C470,117 560,72 700,92 C850,113 940,76 1080,94 C1230,113 1330,78 1440,92 L1440,200 L0,200 Z',
  'M0,96 C240,66 400,116 640,92 C880,68 1010,112 1200,94 C1320,83 1380,90 1440,96 L1440,200 L0,200 Z',
]

const GROUND: Record<string, string> = {
  paper: '#f3e6cb',
  mist: '#eef3f2',
  deep: '#04121a',
  default: '#06171d',
}

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E\")"

/* CSS cannot touch a video, and it cannot help a phone that is struggling either —
   both are decided here, in JS, on the live preference. */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia('(prefers-reduced-motion: reduce)')
      query.addEventListener('change', notify)
      return () => query.removeEventListener('change', notify)
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  )
}

export function Sky({
  variant = 'dusk',
  scrollY = 0,
  showWaves = true,
  showShip = true,
  quiet = false,
}: {
  variant?: SkyVariant
  scrollY?: number
  showWaves?: boolean
  showShip?: boolean
  /* The mode for content screens. On a full screen the sky reads as a place; cut
     down to a band above a grid you stop seeing a sky and start seeing the shapes
     it is made of — a perfect circle, parallel curves, a straight edge. So the
     decor withdraws: the light stays, the objects leave. */
  quiet?: boolean
}) {
  const reduced = usePrefersReducedMotion()
  const clouds = useMemo(
    () => [
      { top: '9%', w: 150, dur: 68, delay: -12 },
      { top: '16%', w: 90, dur: 92, delay: -40 },
      { top: '22%', w: 210, dur: 120, delay: -70 },
      { top: '5%', w: 70, dur: 150, delay: -100 },
    ],
    [],
  )
  const stars = useMemo(
    () =>
      Array.from({ length: 46 }, () => ({
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        dur: `${(1.6 + Math.random() * 2.6).toFixed(2)}s`,
        delay: `${(-Math.random() * 3).toFixed(2)}s`,
      })),
    [],
  )

  const sun = SUN[variant]
  const tint = WAVE_TINT[variant] ?? WAVE_TINT.default
  const waves = showWaves && !reduced
  const ship =
    waves && showShip && !quiet && variant !== 'paper' && variant !== 'deep'

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{ transform: `translateY(${-scrollY * 0.22}px)` }}
    >
      <div
        className="absolute inset-0"
        style={{ background: SKY[variant], transition: 'background 1.2s cubic-bezier(.4,0,.2,1)' }}
      />

      {variant === 'night' &&
        stars.map((star, i) => (
          <i
            key={i}
            className="absolute size-[2px] rounded-full bg-[#dce8ff]"
            style={{
              left: star.left,
              top: star.top,
              animation: `hz-twinkle ${star.dur} ease-in-out ${star.delay} infinite alternate`,
            }}
          />
        ))}

      {sun && !quiet && (
        <div
          className="absolute rounded-full"
          style={{
            left: '50%',
            top: sun.top,
            width: sun.size,
            height: sun.size,
            opacity: sun.op,
            background: 'var(--gradient-sun-disc)',
            transform: 'translateX(-50%)',
            animation: 'hz-drift var(--duration-swell) ease-in-out infinite alternate',
          }}
        />
      )}

      {variant === 'mist' && (
        <>
          <div
            className="absolute"
            style={{
              left: '-20%',
              top: '18%',
              width: '140%',
              height: 120,
              borderRadius: '50%',
              background: 'rgba(255,255,255,.75)',
              filter: 'blur(26px)',
              animation: 'hz-sail 80s linear infinite',
            }}
          />
          <div
            className="absolute"
            style={{
              left: '50%',
              bottom: '12%',
              transform: 'translateX(-50%)',
              width: 260,
              height: 90,
              borderRadius: '50% 50% 0 0 / 100% 100% 0 0',
              background: 'linear-gradient(180deg, rgba(120,146,150,.5), rgba(90,116,122,.15))',
              filter: 'blur(1px)',
            }}
          />
        </>
      )}

      {!quiet &&
        variant !== 'paper' &&
        variant !== 'mist' &&
        clouds.map((cloud, i) => (
          <div
            key={i}
            className="absolute h-[10px]"
            style={{
              top: cloud.top,
              width: cloud.w,
              borderRadius: 40,
              filter: 'blur(6px)',
              background:
                variant === 'night' ? 'rgba(150,180,230,.16)' : 'rgba(255,225,190,.22)',
              animation: `hz-sail ${cloud.dur}s linear ${cloud.delay}s infinite`,
            }}
          />
        ))}

      {/* A ship on the water line. Deliberately generic — a three-master in
          silhouette, not an identifiable vessel: no copyrighted shape enters the
          repository. Its hull sits six pixels below the crest so the wave in front
          passes over it, and it is that overlap, not a drop shadow, that puts it
          IN the water rather than on it. */}
      {ship && (
        <div
          className="absolute left-0"
          style={{
            top: 'calc(27% - 26px)',
            width: 146,
            height: 88,
            opacity: variant === 'mist' ? 0.55 : 0.92,
            animation: 'hz-cross 190s linear infinite',
          }}
        >
          <svg
            viewBox="0 0 200 120"
            width="100%"
            height="100%"
            fill={variant === 'mist' ? 'rgba(52,72,80,.62)' : 'rgba(5,18,24,.9)'}
            style={{
              display: 'block',
              animation: 'hz-pitch 7s ease-in-out infinite',
              transformOrigin: '50% 92%',
            }}
          >
            <path d="M24 88h152l-13 17q-63 9-126 0Z" />
            <path d="M176 88l22-11 2 5-18 8Z" />
            <path d="M60.5 88V22h3v66ZM98.5 88V8h3v80ZM136.5 88V26h3v62Z" />
            <path d="M63 22c22 6 22 16 0 22Z" />
            <path d="M63 50c26 7 26 19 0 26Z" />
            <path d="M101 10c27 7 27 19 0 26Z" />
            <path d="M101 42c31 8 31 22 0 30Z" />
            <path d="M139 26c21 6 21 15 0 21Z" />
            <path d="M139 53c19 6 19 15 0 21Z" />
            <path d="M101 4l19 5-19 5Z" />
          </svg>
        </div>
      )}

      {/* The sun goes, its glow stays: wide, off-centre, edgeless. The light comes
          from somewhere instead of being a ball sitting there. */}
      {quiet && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: '-30%',
            right: '-10%',
            top: '-18%',
            height: '70%',
            background:
              'radial-gradient(60% 70% at 68% 62%, rgba(255,214,150,.30), rgba(255,196,120,.10) 46%, transparent 72%)',
          }}
        />
      )}

      {waves && !(quiet && variant === 'mist') && (
        <div className="pointer-events-none absolute inset-x-0" style={{ top: '27%', height: 130 }}>
          {[0, 1, 2].map((i) => (
            <svg
              key={i}
              viewBox="0 0 1440 200"
              preserveAspectRatio="none"
              className="absolute left-0 h-full w-[200%]"
              style={{
                top: i * -11,
                opacity: [0.9, 0.75, 1][i] * (quiet ? 0.55 : 1),
                animation: `hz-roll ${[19, 29, 43][i]}s linear infinite${i === 1 ? ' reverse' : ''}`,
              }}
            >
              <path d={WAVE_PATHS[i]} fill={tint[i]} />
              <path d={WAVE_PATHS[i]} fill={tint[i]} transform="translate(1440,0)" />
            </svg>
          ))}
        </div>
      )}

      {variant !== 'paper' && variant !== 'deep' && variant !== 'mist' && (
        <div
          className="absolute"
          style={{
            left: '50%',
            top: '31%',
            width: 120,
            height: '22%',
            transform: 'translateX(-50%)',
            filter: 'blur(9px)',
            background:
              variant === 'night'
                ? 'linear-gradient(180deg, rgba(150,190,255,.28), transparent)'
                : 'linear-gradient(180deg, rgba(255,190,110,.55), rgba(255,170,90,0))',
            animation: 'hz-shimmer 5s ease-in-out infinite alternate',
          }}
        />
      )}

      {/* No seam: the band of sky dissolves into the page ground instead of stopping
          dead. That straight edge is what read as "decorative banner". */}
      {quiet && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0"
          style={{
            height: '78%',
            background: `linear-gradient(180deg, transparent, ${GROUND[variant] ?? GROUND.default} 52%)`,
          }}
        />
      )}

      {/* The grain. Everything else is a smooth CSS gradient with perfect vector
          edges — which is precisely the signature of a cheap render. At 3.5% it is
          felt rather than seen. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ opacity: 0.035, mixBlendMode: 'overlay', backgroundImage: GRAIN }}
      />
    </div>
  )
}

/* ── The guarantee of legibility ────────────────────────────────────────────
   The sky is not a background: it crosses the whole value scale, from night blue to
   a band of almost-white sun, and it moves. Setting --text-primary on it bare gives
   1.21:1 on dusk, 1.08:1 on dawn and 1.03:1 on day — invisible, not merely
   uncomfortable. No text sits directly on Sky. It goes through Scrim.

   Geometry: the veil anchors to the SAME containing block as Sky, never to the text
   box. That is the only way its stops stay meaningful — a gradient pinned in
   percentages of the sky's height, applied to a box whose height follows the copy,
   slides every time the wording changes. One Scrim per screen, at the top.        */
const VEIL = {
  dark: {
    full: 'linear-gradient(180deg, rgba(4,18,26,.2) 0%, rgba(4,18,26,.64) 24%, rgba(4,18,26,.82) 58%, rgba(4,18,26,.92) 100%)',
    soft: 'linear-gradient(180deg, rgba(4,18,26,0) 0%, rgba(4,18,26,.34) 40%, rgba(4,18,26,.62) 100%)',
    color: 'var(--text-primary)',
    vars: undefined,
  },
  light: {
    full: 'linear-gradient(180deg, rgba(243,230,203,.34) 0%, rgba(240,228,200,.72) 26%, rgba(240,228,200,.92) 62%, rgba(240,228,200,.96) 100%)',
    soft: 'linear-gradient(180deg, rgba(243,230,203,0) 0%, rgba(240,228,200,.4) 40%, rgba(240,228,200,.7) 100%)',
    color: 'var(--text-on-paper)',
    /* On a pale sky the whole text scale has to invert, not just the colour of the
       paragraph: --text-faint is cream, and a cream code on cream paper is
       invisible. Redeclaring the variables here flips every descendant at once, so
       a screen cannot forget — the light screens are exactly the ones nobody
       remembers to check. */
    vars: {
      '--text-primary': 'var(--color-paper-ink)',
      '--text-secondary': 'rgba(34,28,18,.72)',
      '--text-faint': 'rgba(34,28,18,.6)',
      '--surface-rail': 'rgba(34,28,18,.16)',
      '--surface-recessed': 'rgba(34,28,18,.08)',
      '--accent-numeral': '#8a5a12',
    } as CSSProperties,
  },
}

const LIGHT_SKIES: SkyVariant[] = ['paper', 'mist']

export function Scrim({
  over = 'dusk',
  strength = 'full',
  style,
  className = '',
  children,
}: {
  over?: SkyVariant
  /* Reserved for text that never rises above the water line (past 40% of the
     height), where the sea is already dark. */
  strength?: 'full' | 'soft'
  style?: CSSProperties
  className?: string
  children: ReactNode
}) {
  const veil = VEIL[LIGHT_SKIES.includes(over) ? 'light' : 'dark']
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: veil[strength] }}
      />
      <div className={`relative z-[1] ${className}`} style={{ color: veil.color, ...veil.vars, ...style }}>
        {children}
      </div>
    </>
  )
}
