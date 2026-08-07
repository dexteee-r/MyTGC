import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
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
   poster is a card you are hunting. Labels stay, so nothing rests on recognising a
   drawing. */
const TABS = [
  { to: '/', label: 'Classeur', Icon: StrawHatIcon },
  { to: '/packs', label: 'Extensions', Icon: SeaChartIcon },
  { to: '/scan', label: 'Scanner', Icon: LogPoseIcon },
  { to: '/search', label: 'Chercher', Icon: NewsIcon },
  { to: '/wishlist', label: 'Recherchées', Icon: WantedIcon },
  { to: '/collection', label: 'Collection', Icon: ShipLogIcon },
]

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
  if (!user) return <SignIn />

  return (
    <LanguageProvider>
      <CollectionProvider>
        <ToastProvider>
          <BrowserRouter>
            <div className="mx-auto flex h-full max-w-2xl flex-col">
              <main className="min-h-0 flex-1">
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
              <TabBar />
            </div>
          </BrowserRouter>
        </ToastProvider>
      </CollectionProvider>
    </LanguageProvider>
  )
}

/* Six niches chiselled along the base of the slab, flush to the edge and squared —
   not the floating pill every app has had since 2021. The one you are in is the
   plate that has been raised out of the stone and caught the light, with a thread
   of ember burning in the groove above it. Depth and light carry the state; nothing
   is painted a brand colour to look selected. */
function TabBar() {
  return (
    <nav
      aria-label="Navigation principale"
      className="wall shrink-0 pb-[env(safe-area-inset-bottom)]"
      style={{ boxShadow: '0 -1px 0 rgba(255,240,214,0.05) inset' }}
    >
      <div className="flex gap-px">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="min-w-0 flex-1">
            {({ isActive }) => (
              <span
                style={{ boxShadow: isActive ? 'var(--relief)' : 'var(--groove)' }}
                className={`relative flex min-h-14 flex-col items-center justify-center gap-1.5 transition ${
                  isActive ? 'bg-stone-lit text-carve' : 'bg-niche text-carve-faint'
                }`}
              >
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 top-0 h-px bg-ember"
                    style={{ boxShadow: '0 0 6px 1px rgba(217,58,32,0.55)' }}
                  />
                )}
                <Icon className="size-[20px]" />
                <span className="text-[9px] leading-none font-semibold tracking-wide">
                  {label}
                </span>
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
