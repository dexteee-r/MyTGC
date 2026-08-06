import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { BoxIcon, CameraIcon, HomeIcon, LayersIcon, SearchIcon } from './components/icons'
import { CollectionProvider } from './lib/collection'
import { LanguageProvider } from './lib/language'
import { ToastProvider } from './lib/toast'
import { CardDetail } from './pages/CardDetail'
import { Collection } from './pages/Collection'
import { Home } from './pages/Home'
import { PackDetail } from './pages/PackDetail'
import { Packs } from './pages/Packs'
import { Scanner } from './pages/Scanner'
import { Search } from './pages/Search'

/* Scanner sits in the middle because it is the reason the app exists — the thumb
   reaches it without moving. No Decks tab: out of scope per PROJECT_CONTEXT.md
   section 8, despite the reference app having one. */
const TABS = [
  { to: '/', label: 'Accueil', Icon: HomeIcon },
  { to: '/packs', label: 'Extensions', Icon: LayersIcon },
  { to: '/scan', label: 'Scanner', Icon: CameraIcon, primary: true },
  { to: '/search', label: 'Chercher', Icon: SearchIcon },
  { to: '/collection', label: 'Collection', Icon: BoxIcon },
]

export default function App() {
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
                  <Route path="/collection" element={<Collection />} />
                  <Route path="/card/:cardId" element={<CardDetail />} />
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

function TabBar() {
  return (
    <nav
      aria-label="Navigation principale"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center pb-[max(0.6rem,env(safe-area-inset-bottom))]"
    >
      <div className="pointer-events-auto flex w-[min(100%-1rem,32rem)] justify-around rounded-2xl border border-line/70 bg-sea-raised/95 px-1.5 py-1.5 backdrop-blur">
        {TABS.map(({ to, label, Icon, primary }) => (
          <NavLink key={to} to={to} end={to === '/'} className="min-w-0 flex-1">
            {({ isActive }) => (
              <span
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl transition ${
                  isActive
                    ? primary
                      ? 'bg-signal text-white'
                      : 'bg-sea-high text-foam'
                    : 'text-foam-faint'
                }`}
              >
                <Icon className="size-[22px]" />
                <span className="text-[10px] leading-none font-medium">{label}</span>
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
