import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { CollectionGroup } from '../lib/types'
import { Button, Dialog } from './ui'

/* Where to send one or more held cards to a personal group -- reused by the card
   sheet's single-card add and the Collection grid's multi-select bulk add, so the
   two can never drift on what "add to a group" looks like. Creating a group and
   picking it happen in the same tap: nobody opens this just to manage groups, they
   arrive with cards already in hand wanting a destination for them. */
export function GroupPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (groupId: number) => void
}) {
  const [groups, setGroups] = useState<CollectionGroup[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      api.groups().then(setGroups).catch(() => setGroups([]))
    } else {
      // Reset for the next time this opens, rather than flashing the previous
      // session's half-typed name for a moment before it clears.
      setCreating(false)
      setName('')
    }
  }, [open])

  const createAndPick = async () => {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      const group = await api.createGroup(trimmed)
      onPick(group.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Ajouter à un groupe">
      {groups === null ? (
        <p className="t-code text-[var(--text-faint)]">Chargement…</p>
      ) : (
        <div className="space-y-4">
          {groups.length > 0 && (
            <ul className="space-y-2">
              {groups.map((group) => (
                <li key={group.id}>
                  <button
                    onClick={() => onPick(group.id)}
                    className="flex min-h-[var(--touch)] w-full items-center justify-between gap-3 rounded-[14px] px-4"
                    style={{ background: 'var(--surface-recessed)' }}
                  >
                    <span className="truncate text-sm font-medium">{group.name}</span>
                    <span className="t-numeral shrink-0 text-sm text-[var(--text-faint)]">
                      {group.card_count}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {creating ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') createAndPick()
                }}
                placeholder="Nom du groupe"
                maxLength={60}
                aria-label="Nom du nouveau groupe"
                className="t-code min-h-[var(--touch)] w-full min-w-0 rounded-full px-4 outline-none"
                style={{ background: 'var(--surface-recessed)' }}
              />
              <Button variant="quiet" disabled={!name.trim() || busy} onClick={createAndPick}>
                Créer
              </Button>
            </div>
          ) : (
            <Button variant="quiet" full onClick={() => setCreating(true)}>
              + Nouveau groupe
            </Button>
          )}
        </div>
      )}
    </Dialog>
  )
}
