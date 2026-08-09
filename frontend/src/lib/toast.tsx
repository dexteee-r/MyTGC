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
          className="animate-seat pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4"
        >
          {/* A plate raised out of the slab, with the ember still in the groove along
              its top edge — the light has just been struck, and it goes out with the
              message. Squared off: nothing in this interface is a floating pill. */}
          <div
            className="hz-enter pointer-events-auto relative flex w-full max-w-md items-center gap-3 rounded-full py-2 pr-2 pl-5"
            style={{
              background: 'rgba(4,18,26,.86)',
              color: 'var(--color-paper-100)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              boxShadow: '0 12px 30px rgba(0,0,0,.55), inset 0 0 0 1px rgba(243,230,203,.14)',
            }}
          >
            <span className="min-w-0 flex-1 truncate text-sm">{toast.message}</span>
            {toast.undo && (
              <button
                onClick={() => {
                  toast.undo?.()
                  setToast(null)
                }}
                className="min-h-[var(--touch)] shrink-0 rounded-full px-4 text-sm font-semibold"
                style={{ background: 'rgba(243,230,203,.16)', color: 'var(--color-paper-100)' }}
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
