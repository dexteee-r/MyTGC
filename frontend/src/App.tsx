import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { BoxIcon, CameraIcon, HomeIcon, LayersIcon, SearchIcon } from './components/icons'
import { LanguageProvider } from './lib/language'
import { CardDetail } from './pages/CardDetail'
import { Collection } from './pages/Collection'
import { Home } from './pages/Home'
import { PackDetail } from './pages/PackDetail'
import { Packs } from './pages/Packs'
import { Scanner } from './pages/Scanner'
import { Search } from './pages/Search'

/* The Scanner tab arrived with the step-5 gate: 0 wrong answers at threshold 52, so
   a result can be shown without risking a silently wrong card in the collection.
   No Decks tab — deck building is out of scope per PROJECT_CONTEXT.md section 8,
   despite the reference app having one. */
const TABS = [
  { to: '/', label: 'Accueil', Icon: HomeIcon },
  { to: '/packs', label: 'Extensions', Icon: LayersIcon },
  { to: '/scan', label: 'Scanner', Icon: CameraIcon },
  { to: '/search', label: 'Recherche', Icon: SearchIcon },
  { to: '/collection', label: 'Collection', Icon: BoxIcon },
]

export default function App() {
  return (
    <LanguageProvider>
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
    </LanguageProvider>
  )
}

function TabBar() {
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-auto flex w-[min(100%-1.5rem,36rem)] justify-around rounded-full bg-surface px-2 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.10)]">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="min-w-0 flex-1">
            {({ isActive }) => (
              <span
                className={`flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] transition ${
                  isActive ? 'bg-crimson-soft font-semibold text-crimson' : 'text-ink-soft'
                }`}
              >
                <Icon className="size-6" />
                {label}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
