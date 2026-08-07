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

/* Divider tabs, flush to the bottom edge and squared off — the labelled dividers of
   a binder rather than the floating pill every app has had since 2021. The active
   one is marked by a rule along its top edge, which is how a raised divider reads. */
function TabBar() {
  return (
    <nav
      aria-label="Navigation principale"
      className="shrink-0 border-t border-rail bg-ink pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="min-w-0 flex-1">
            {({ isActive }) => (
              <span
                className={`flex min-h-14 flex-col items-center justify-center gap-1.5 border-t-2 transition ${
                  isActive
                    ? 'border-label bg-pocket text-label'
                    : 'border-transparent text-label-faint'
                }`}
              >
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
