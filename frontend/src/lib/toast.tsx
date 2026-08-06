import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/* Confirmation with a way back. Adding a card during a scanning run is fast and
   repetitive, which is exactly when a mis-tap goes unnoticed — so every add says
   what happened and offers to undo it, rather than trusting the user to spot a
   number changing somewhere else on screen. */

interface Toast {
  id: number
  message: string
  undo?: () => void
}

const Ctx = createContext<{ show: (message: string, undo?: () => void) => void }>({
  show: () => {},
})

const DURATION = 4200

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<number>(undefined)

  const show = useCallback((message: string, undo?: () => void) => {
    window.clearTimeout(timer.current)
    setToast({ id: Date.now(), message, undo })
    timer.current = window.setTimeout(() => setToast(null), DURATION)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="animate-rise pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4"
        >
          <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-full border border-line bg-sea-high py-2.5 pr-2.5 pl-4 shadow-2xl">
            <span className="min-w-0 flex-1 truncate text-sm">{toast.message}</span>
            {toast.undo && (
              <button
                onClick={() => {
                  toast.undo?.()
                  setToast(null)
                }}
                className="shrink-0 rounded-full bg-sea px-3.5 py-1.5 text-sm font-semibold text-gold"
              >
                Annuler
              </button>
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
