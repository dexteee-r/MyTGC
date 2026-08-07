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
            className="plate animate-ignite pointer-events-auto relative flex w-full max-w-md items-center gap-3 rounded-[2px] py-2.5 pr-2.5 pl-4"
            style={{ boxShadow: 'var(--relief), 0 12px 28px rgba(0,0,0,0.65)' }}
          >
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-px bg-ember"
              style={{ boxShadow: '0 0 8px 1px rgba(217,58,32,0.5)' }}
            />
            <span className="min-w-0 flex-1 truncate text-sm">{toast.message}</span>
            {toast.undo && (
              <button
                onClick={() => {
                  toast.undo?.()
                  setToast(null)
                }}
                style={{ boxShadow: 'var(--groove)' }}
                className="shrink-0 rounded-[2px] bg-niche px-3.5 py-2 text-sm font-semibold text-carve-dim"
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
