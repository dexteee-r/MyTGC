import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CameraIcon, SearchIcon } from '../components/icons'
import { Button, ColorDots, PageTitle, Segmented, Spinner } from '../components/ui'
import { api, imageUrl } from '../lib/api'
import { LANGUAGE_OPTIONS, useLanguage } from '../lib/language'
import type { ScanCandidate, ScanResult } from '../lib/types'

export function Scanner() {
  const { language, setLanguage } = useLanguage()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = async (file: File) => {
    setBusy(true)
    setError(null)
    setResult(null)
    setPreview(URL.createObjectURL(file))
    try {
      setResult(await api.scan(file, language))
    } catch {
      setError("Le scan a échoué. Vérifie que l'API est accessible.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="no-scrollbar h-full overflow-y-auto pb-32">
      <PageTitle subtitle="Photographie une carte pour l'identifier">Scanner</PageTitle>

      <div className="px-5 pb-4">
        <p className="pb-2 text-sm font-semibold">Édition scannée</p>
        <Segmented value={language} options={LANGUAGE_OPTIONS} onChange={setLanguage} />
        <p className="pt-2 text-xs text-ink-faint">
          L'illustration est identique dans les deux éditions : l'app ne peut pas la
          deviner, c'est à toi de la choisir.
        </p>
      </div>

      <div className="px-5">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) submit(file)
            event.target.value = ''
          }}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={busy}>
          <span className="inline-flex items-center gap-2">
            <CameraIcon className="size-5" />
            {busy ? 'Analyse…' : 'Photographier une carte'}
          </span>
        </Button>
      </div>

      <div className="mx-5 mt-4 rounded-(--radius-card) bg-gold-soft p-4 text-sm text-ink-soft">
        Cadre la carte <span className="font-semibold text-ink">entière</span>, seule sur
        un fond uni. Un bord coupé ou un reflet fort suffit à faire échouer la
        reconnaissance.
      </div>

      {preview && (
        <img
          src={preview}
          alt=""
          className="mx-auto mt-5 w-[min(60%,240px)] rounded-xl shadow-lg"
        />
      )}

      {busy && <Spinner />}
      {error && <p className="px-5 pt-4 text-sm text-crimson">{error}</p>}

      {result && !busy && <Outcome result={result} />}
    </div>
  )
}

function Outcome({ result }: { result: ScanResult }) {
  if (!result.detected || result.candidates.length === 0) {
    return (
      <div className="mx-5 mt-5 rounded-(--radius-card) bg-surface p-5 text-center shadow-sm">
        <p className="font-semibold">Non reconnue</p>
        <p className="mt-1 text-sm text-ink-soft">
          {result.message ?? 'Aucune correspondance.'}
        </p>
        <div className="mt-4 flex justify-center">
          <Link to="/search">
            <Button variant="ghost">
              <span className="inline-flex items-center gap-2">
                <SearchIcon className="size-5" /> Chercher manuellement
              </span>
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const [top, ...rest] = result.candidates
  return (
    <div className="mt-5">
      <div className="px-5 pb-2">
        <p className="text-sm font-semibold">
          {result.confident ? 'Carte identifiée' : 'Plusieurs possibilités'}
        </p>
        {!result.confident && (
          <p className="text-xs text-ink-faint">
            L'écart avec la suivante est faible — vérifie avant d'ajouter.
          </p>
        )}
      </div>

      <Match candidate={top} highlight={result.confident} />

      {rest.length > 0 && (
        <>
          <p className="px-5 pt-4 pb-2 text-sm font-semibold">Autres candidats</p>
          {rest.map((candidate) => (
            <Match key={`${candidate.language}-${candidate.card_number}`} candidate={candidate} />
          ))}
        </>
      )}
    </div>
  )
}

function Match({
  candidate,
  highlight,
}: {
  candidate: ScanCandidate
  highlight?: boolean
}) {
  const card = candidate.card
  const src = card ? imageUrl(card) : null
  return (
    <Link
      to={`/card/${encodeURIComponent(candidate.printings[0]?.card_id ?? candidate.card_number)}?language=${candidate.language}`}
      className={`mx-5 mt-2 flex items-center gap-3 rounded-(--radius-card) bg-surface p-3 shadow-sm ${
        highlight ? 'ring-2 ring-crimson' : ''
      }`}
    >
      {src && <img src={src} alt="" className="h-24 w-[69px] rounded-md object-cover" />}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{candidate.name}</p>
        <p className="truncate text-sm text-ink-faint">
          {candidate.card_number} · {candidate.language.toUpperCase()} ·{' '}
          {card?.rarity ?? ''}
        </p>
        {card && <ColorDots colors={card.colors} />}
        {candidate.ambiguous_printing && (
          <p className="mt-1 text-xs text-gold">
            {candidate.printings.length} tirages identiques — à choisir sur la fiche
          </p>
        )}
      </div>
      <span className="shrink-0 text-xs text-ink-faint tabular-nums">
        {candidate.distance}
      </span>
    </Link>
  )
}
