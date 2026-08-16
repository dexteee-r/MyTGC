import { useEffect, useState } from 'react'
import { Button, Dialog } from './ui'
import { useToast } from '../lib/toast'
import type { ShareStatus } from '../lib/types'

/* ── One public link, one screen ──────────────────────────────────────────────
   Collection and Wishlist each own a copy of this dialog rather than a single
   generic "share settings" screen shared by both: the link is scoped to the page
   the person is looking at when they reach for it, and the two resources are
   controlled independently on the server (see BACKLOG.md — turning one on never
   turns the other on). This component is the one piece actually identical between
   them: the fetch-toggle-copy dance, parameterised by which pair of endpoints to
   call and which public path the token resolves to.

   No live "regenerate" here on purpose. The status endpoint is what a browser
   without a copy of the token asks; regenerating would silently break every copy
   already handed out, and the person who wants that can turn sharing off and back
   on, which is the same operation done honestly in two steps instead of one that
   looks safe and is not. */

export function ShareDialog({
  open,
  onClose,
  title,
  description,
  fetchStatus,
  enable,
  disable,
  publicPath,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  fetchStatus: () => Promise<ShareStatus>
  enable: () => Promise<ShareStatus>
  disable: () => Promise<void>
  publicPath: (token: string) => string
}) {
  const [status, setStatus] = useState<ShareStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const { show } = useToast()

  useEffect(() => {
    if (!open) return
    setStatus(null)
    fetchStatus()
      .then(setStatus)
      .catch(() => show("Impossible de vérifier l'état du partage."))
    // fetchStatus/enable/disable/publicPath are stable per call site (defined
    // inline as api.* references), and re-running this on every render would
    // refetch on each keystroke elsewhere on the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggle = async () => {
    setBusy(true)
    try {
      if (status?.enabled) {
        await disable()
        setStatus({ enabled: false, token: null })
      } else {
        setStatus(await enable())
      }
    } catch {
      show("Le changement n'a pas abouti.")
    } finally {
      setBusy(false)
    }
  }

  const url = status?.token ? `${window.location.origin}${publicPath(status.token)}` : null

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      show('Lien copié.')
    } catch {
      show("La copie n'a pas abouti — sélectionne le lien à la main.")
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p>

        {status === null ? (
          <p className="t-code text-[var(--text-faint)]">Chargement…</p>
        ) : (
          <>
            {status.enabled && url && (
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={url}
                  aria-label="Lien de partage"
                  onFocus={(event) => event.target.select()}
                  className="t-code min-h-[var(--touch)] w-full min-w-0 rounded-full px-4 outline-none"
                  style={{ background: 'var(--surface-recessed)' }}
                />
                <Button variant="quiet" onClick={copy}>
                  Copier
                </Button>
              </div>
            )}

            <Button
              variant={status.enabled ? 'quiet' : 'primary'}
              full
              disabled={busy}
              onClick={toggle}
            >
              {busy
                ? 'Un instant…'
                : status.enabled
                  ? 'Désactiver le partage'
                  : 'Activer le partage'}
            </Button>
          </>
        )}
      </div>
    </Dialog>
  )
}
