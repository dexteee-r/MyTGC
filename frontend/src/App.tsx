import { createContext, useContext, useMemo, useState } from 'react'
import {
  BrowserRouter,
  NavLink,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { Scrim, Sky, type SkyVariant } from './components/Sky'
import {
  LogPoseIcon,
  NewsIcon,
  SeaChartIcon,
  ShipLogIcon,
  StrawHatIcon,
  WantedIcon,
} from './components/icons'
import { Spinner } from './components/ui'
import { AuthProvider, useAuth } from './lib/auth'
import { CollectionProvider } from './lib/collection'
import { LanguageProvider } from './lib/language'
import { ToastProvider } from './lib/toast'
import { Account } from './pages/Account'
import { CardDetail } from './pages/CardDetail'
import { Collection } from './pages/Collection'
import { Home } from './pages/Home'
import { PackDetail } from './pages/PackDetail'
import { Packs } from './pages/Packs'
import { Scanner } from './pages/Scanner'
import { Search } from './pages/Search'
import { SignIn } from './pages/SignIn'
import { Wishlist } from './pages/Wishlist'

/* Each tab carries the object from the story that does its job: you point a Log Pose
   at something to read it, a ship's log records what you brought back, a wanted
   poster is a card you are hunting.

   "Primes" rather than "Recherchées": the long word does not fit six tabs at 390px
   and was being truncated. The screen keeps its full title, and so does the desktop
   rail — the constraint was the width of a thumb, not of a screen. */
const TABS = [
  { to: '/', label: 'Classeur', Icon: StrawHatIcon },
  { to: '/packs', label: 'Extensions', Icon: SeaChartIcon },
  { to: '/scan', label: 'Scanner', Icon: LogPoseIcon },
  { to: '/search', label: 'Chercher', Icon: NewsIcon },
  { to: '/wishlist', label: 'Primes', rail: 'Recherchées', Icon: WantedIcon },
  { to: '/collection', label: 'Collection', Icon: ShipLogIcon },
]

/* The hour of each screen. The grids run on `deep` because there the decor has to
   get out of the way — the cards are the subject. */
function skyFor(path: string): { variant: SkyVariant; quiet: boolean } {
  if (path.startsWith('/card/')) return { variant: 'deep', quiet: false }
  if (path.startsWith('/packs/')) return { variant: 'deep', quiet: false }
  if (path === '/packs') return { variant: 'day', quiet: true }
  if (path === '/scan') return { variant: 'mist', quiet: true }
  if (path === '/search') return { variant: 'deep', quiet: false }
  if (path === '/wishlist') return { variant: 'paper', quiet: false }
  if (path === '/collection') return { variant: 'dawn', quiet: true }
  if (path === '/account') return { variant: 'dusk', quiet: true }
  return { variant: 'dusk', quiet: false }
}

/* The main gesture of the app is scrolling a grid, so the world behind it moves too.
   Each scrolling surface reports its offset here rather than the shell owning the
   scroll: the card grid is virtualised against its own scroll element, and taking
   that away from it would cost the windowing that makes 9,447 rows possible. */
const SkyScroll = createContext<(offset: number) => void>(() => {})
export const useSkyScroll = () => useContext(SkyScroll)

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

/* The collection provider mounts only once someone is signed in: it loads that
   person's holdings on mount, and mounting it earlier would fire an unauthenticated
   request on every cold start. */
function Gate() {
  const { ready, user } = useAuth()

  if (!ready) return <Spinner />
  if (!user)
    return (
      <div className="relative h-full overflow-hidden">
        <Sky variant="dawn" />
        {/* Sky is positioned at z-index 0, and a positioned element paints above
            static content whatever the DOM order — without a stacking context of its
            own the whole sign-in form ended up underneath the sky. Every screen that
            sits over Sky needs this; the Scrim carries it for the rest of the app. */}
        {/* Same veil as every other screen: the wordmark and the labels sit on the
            brightest band of the sky, which is where bare text measures 1.08:1. */}
        <Scrim over="dawn" className="h-full">
          <SignIn />
        </Scrim>
      </div>
    )

  return (
    <LanguageProvider>
      <CollectionProvider>
        <ToastProvider>
          <BrowserRouter>
            <Shell />
          </BrowserRouter>
        </ToastProvider>
      </CollectionProvider>
    </LanguageProvider>
  )
}

function Shell() {
  const { pathname } = useLocation()
  const [scrollY, setScrollY] = useState(0)
  const { variant, quiet } = skyFor(pathname)

  /* A fresh screen starts at the top of its sky; carrying the previous screen's
     offset would open it with the horizon already scrolled off. */
  const report = useMemo(() => {
    setScrollY(0)
    return (offset: number) => setScrollY(offset)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <SkyScroll.Provider value={report}>
      <div className="relative h-full overflow-hidden">
        <Sky variant={variant} scrollY={scrollY} quiet={quiet} showShip={pathname !== '/'} />

        {/* The veil lives here, once, as a sibling of Sky — not inside a screen.
            Its stops are percentages of the sky's height, and pinned to a box whose
            height follows the copy they would slide from one screen to the next. It
            is also what flips the text colour on the pale skies, so a screen cannot
            forget to. Measured: --text-primary bare on `day` is 1.03:1. */}
        <Scrim
          over={variant}
          strength={variant === 'deep' ? 'soft' : 'full'}
          /* The strip spans the window and its contents are centred, rather than the
             strip itself being as narrow as the column: a border that stops halfway
             across the viewport reads as a layout that ran out. */
          className="flex h-full flex-col"
        >
          <TabBar />
          <main
            key={pathname}
            className="hz-enter mx-auto min-h-0 w-full min-w-0 max-w-2xl flex-1 pt-[env(safe-area-inset-top)] lg:max-w-5xl lg:pt-0"
          >
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/packs" element={<Packs />} />
              <Route path="/packs/:packCode" element={<PackDetail />} />
              <Route path="/scan" element={<Scanner />} />
              <Route path="/search" element={<Search />} />
              <Route path="/wishlist" element={<Wishlist />} />
              <Route path="/collection" element={<Collection />} />
              <Route path="/card/:cardId" element={<CardDetail />} />
              <Route path="/account" element={<Account />} />
            </Routes>
          </main>
        </Scrim>
      </div>
    </SkyScroll.Provider>
  )
}

/* A row of lanterns along the deck on a phone, at the bottom where a thumb reaches;
   a centred strip across the top on a wide screen, where the labels get to be words
   again and nothing is within reach of a thumb anyway.

   The lit bar follows the edge it hangs from: above the tab at the bottom of a phone,
   under it at the top of a browser. A glow floating away from its own edge reads as a
   stray line rather than as a lamp. */
function TabBar() {
  return (
    <nav
      aria-label="Navigation principale"
      className="deck order-last shrink-0 border-t border-[var(--surface-rail)] pb-[env(safe-area-inset-bottom)] lg:order-first lg:border-t-0 lg:border-b lg:pt-[env(safe-area-inset-top)] lg:pb-0"
    >
      <div className="flex lg:justify-center lg:gap-1 lg:py-2">
        {TABS.map(({ to, label, rail, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className="min-w-0 flex-1 lg:flex-none"
          >
            {({ isActive }) => (
              <span
                /* The UA default padding on a <button>/<a> ate 12px of 64 and
                   truncated the labels. Set explicitly, always. */
                className={`relative flex min-h-[var(--touch)] flex-col items-center justify-center gap-1.5 px-[2px] py-2.5 transition-colors lg:flex-row lg:gap-2.5 lg:rounded-full lg:px-4 ${
                  isActive
                    ? 'text-[var(--text-primary)] lg:bg-[rgba(243,230,203,.12)]'
                    : 'text-[var(--text-faint)] lg:hover:bg-[rgba(243,230,203,.07)]'
                }`}
              >
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute inset-x-[18%] top-0 h-[2px] bg-sun-500 lg:top-auto lg:-bottom-2 lg:inset-x-3"
                    style={{ boxShadow: '0 0 14px 2px rgba(255,200,110,.75)' }}
                  />
                )}
                <Icon className="size-5 shrink-0" />
                <span className="max-w-full truncate text-[10px] leading-none font-semibold lg:text-sm">
                  <span className="lg:hidden">{label}</span>
                  <span className="hidden lg:inline">{rail ?? label}</span>
                </span>
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
