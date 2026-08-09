import type { CollectionEntry } from './types'

/* ── Taking the log book with you ───────────────────────────────────────────
   The account screen sketched an "Export" link. Rather than stub it, it exists:
   the collection is already loaded in the client, so a CSV costs a string and no
   backend at all.

   Semicolon-separated and UTF-8 with a BOM, because the person opening this will
   open it in French Excel, which reads a comma as a decimal separator and mangles
   accented names without the BOM. A file nobody can open is not an export.        */

const COLUMNS = [
  'code',
  'edition',
  'nom',
  'extension',
  'rarete',
  'quantite',
  'etat',
  'ajoutee_le',
  'prix_acquisition',
] as const

/* A field containing the separator, a quote or a newline has to be quoted, and an
   inner quote doubled. Card names contain apostrophes and the odd comma. */
function field(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function collectionToCsv(entries: CollectionEntry[]): string {
  const rows = entries.map((entry) =>
    [
      entry.card_id,
      entry.language,
      entry.card?.name ?? '',
      entry.card?.pack_name ?? entry.card?.pack_code ?? '',
      entry.card?.rarity ?? '',
      entry.quantity,
      entry.condition ?? '',
      entry.date_added,
      entry.acquisition_price ?? '',
    ]
      .map(field)
      .join(';'),
  )
  return `﻿${COLUMNS.join(';')}\n${rows.join('\n')}\n`
}

export function downloadCollection(entries: CollectionEntry[]) {
  const blob = new Blob([collectionToCsv(entries)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `mytcg-collection-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  /* Revoked on the next tick rather than immediately: Safari has not started reading
     the blob when click() returns, and revoking first gives an empty file. */
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
