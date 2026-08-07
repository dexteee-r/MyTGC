import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LiveScan } from '../components/LiveScan'
import { CameraIcon } from '../components/icons'
import {
  Button,
  ColorBar,
  EmptyState,
  PageHeader,
  Screen,
  Segmented,
  Spinner,
} from '../components/ui'
import { api, imageUrl } from '../lib/api'
import { useCollection } from '../lib/collection'
import { LANGUAGE_OPTIONS, useLanguage } from '../lib/language'
import { useToast } from '../lib/toast'
import type { ScanCandidate, ScanResult } from '../lib/types'
import { Edition, EditionName } from '../components/Edition'

type Mode = 'live' | 'photo'

/* The core loop of the whole product: a binder in one hand, the phone in the other.
   Every extra tap here is paid once per card, so the result adds to the collection
   in place and the camera keeps running. Nothing about identifying a card should
   require navigating away from the scanner.

   Live is the default and photo is the fallback, not the reverse: pointing at a card
   costs no taps at all. Photo stays because live needs a secure context and a granted
   camera permission, and neither is guaranteed — over plain http on a LAN address,
   which is how this is tested on a phone, photo is the only mode that works. */
export function Scanner() {
  const { language, setLanguage } = useLanguage()
  const { add, ownedOf, setQuantity } = useCollection()
  const { show } = useToast()
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>(() =>
    window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === 'function'
      ? 'live'
      : 'photo',
  )
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const capture = () => inputRef.current?.click()

  const onLiveResult = useCallback((incoming: ScanResult) => {
    // Freeze on the first hit and let the user confirm. Auto-adding from a live
    // stream would put cards in the collection that were only ever pointed at.
    setResult((current) => current ?? incoming)
  }, [])

  const submit = async (file: File) => {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(await api.scan(file, language))
    } catch {
      setError("Le serveur n'a pas répondu. Vérifie qu'il tourne, puis reprends.")
    } finally {
      setBusy(false)
    }
  }

  /* Dismiss without adding. In live mode the stream is paused while a result is on
     screen, so clearing it is what resumes scanning. */
  const skipCard = () => {
    setResult(null)
    if (mode === 'photo') capture()
  }

  const addCard = async (candidate: ScanCandidate) => {
    const cardId = candidate.printings[0]?.card_id ?? candidate.card_number
    const before = ownedOf(cardId, candidate.language)
    await add({ id: cardId, language: candidate.language })
    setSession((n) => n + 1)
    const message = before
      ? `${candidate.name} · ${before.quantity + 1}e exemplaire`
      : `${candidate.name} rangée`
    show(message, () => {
      const owned = ownedOf(cardId, candidate.language)
      if (owned) setQuantity(cardId, candidate.language, owned.quantity - 1)
      setSession((n) => Math.max(0, n - 1))
    })
    setResult(null)
    // Live keeps running on its own; photo needs re-arming to save a tap per card.
    if (mode === 'photo') capture()
  }

  return (
    <Screen>
      <PageHeader
        title="Scanner"
        meta={session > 0 ? `${session} rangée${session > 1 ? 's' : ''} dans cette session` : 'Une carte à la fois'}
        action={
          <Segmented
            value={language}
            options={LANGUAGE_OPTIONS}
            onChange={setLanguage}
            label="Édition scannée"
          />
        }
      />

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

      <div className="px-5 pb-4">
        <Segmented
          value={mode}
          options={[
            { value: 'live', label: 'En continu' },
            { value: 'photo', label: 'Photo' },
          ]}
          onChange={(next) => {
            setResult(null)
            setError(null)
            setMode(next)
          }}
          label="Mode de scan"
        />
      </div>

      {mode === 'live' && !busy && (
        <LiveScan
          language={language}
          paused={Boolean(result)}
          onResult={onLiveResult}
          onFallback={() => setMode('photo')}
        />
      )}

      {mode === 'photo' && !result && !busy && (
        <div className="px-5">
          <Button variant="primary" size="lg" full onClick={capture}>
            <CameraIcon className="size-5" />
            Prendre une photo
          </Button>
        </div>
      )}

      {!result && !busy && (
        <p className="px-5 pt-3 text-sm text-carve-dim">
          Une carte seule, à plat, entière dans le cadre. L'édition{' '}
          <span className="font-semibold text-carve">
            <EditionName language={language} />
          </span>{' '}
          est celle qui sera enregistrée — l'illustration est identique dans les deux, elle
          ne peut pas être devinée.
        </p>
      )}

      {busy && (
        <>
          <Spinner />
          <p className="text-center text-sm text-carve-dim">Identification…</p>
        </>
      )}

      {error && (
        <div className="px-5 pt-4">
          <EmptyState title="Scan interrompu" action={<Button variant="quiet" onClick={capture}>Reprendre</Button>}>
            {error}
          </EmptyState>
        </div>
      )}

      {result && !busy && (
        <Outcome
          result={result}
          onAdd={addCard}
          onSkip={skipCard}
          onRetry={capture}
          onSearch={() => navigate('/search')}
        />
      )}
    </Screen>
  )
}

function Outcome({
  result,
  onAdd,
  onSkip,
  onRetry,
  onSearch,
}: {
  result: ScanResult
  onAdd: (candidate: ScanCandidate) => void
  onSkip: () => void
  onRetry: () => void
  onSearch: () => void
}) {
  if (!result.detected || result.candidates.length === 0) {
    return (
      <div className="px-5">
        <EmptyState
          title={result.detected ? 'Carte non reconnue' : 'Aucune carte dans le cadre'}
          action={
            <div className="flex gap-2">
              <Button onClick={onRetry}>Reprendre la photo</Button>
              <Button variant="ghost" onClick={onSearch}>
                Chercher
              </Button>
            </div>
          }
        >
          {result.detected
            ? "Cadre la carte entière, sans reflet. Si elle résiste, ajoute-la par la recherche."
            : 'Pose la carte à plat sur un fond uni et recadre.'}
        </EmptyState>
      </div>
    )
  }

  const [top, ...rest] = result.candidates
  return (
    <div className="animate-seat">
      <Match candidate={top} onAdd={onAdd} onSkip={onSkip} primary confident={result.confident} />


      {rest.length > 0 && (
        <>
          <p className="t-code px-5 pt-7 pb-2">Ou l'une de celles-ci</p>
          {rest.map((candidate) => (
            <Match
              key={`${candidate.language}-${candidate.card_number}`}
              candidate={candidate}
              onAdd={onAdd}
            />
          ))}
        </>
      )}
    </div>
  )
}

function Match({
  candidate,
  onAdd,
  onSkip,
  primary,
  confident,
}: {
  candidate: ScanCandidate
  onAdd: (candidate: ScanCandidate) => void
  onSkip?: () => void
  primary?: boolean
  confident?: boolean
}) {
  const { ownedOf } = useCollection()
  const card = candidate.card
  const cardId = candidate.printings[0]?.card_id ?? candidate.card_number
  const owned = ownedOf(cardId, candidate.language)
  const src = card ? imageUrl(card) : null

  return (
    <section
      className={`mx-5 mt-2 rounded-[2px] p-3 ${primary ? 'plate' : 'niche'}`}
    >
      {primary && !confident && (
        <p className="pb-2 text-xs text-carve-dim">
          Deux cartes se ressemblent ici — vérifie avant d'ajouter.
        </p>
      )}
      <div className="flex gap-3">
        {src && (
          <img
            src={src}
            alt=""
            className={`shrink-0 rounded-md object-cover ${primary ? 'h-32 w-[92px]' : 'h-20 w-[57px]'}`}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start gap-2">
            <ColorBar colors={card?.colors ?? []} className="mt-1 h-8" />
            <div className="min-w-0">
              <p className={`truncate font-semibold ${primary ? 'text-lg' : ''}`}>
                {candidate.name}
              </p>
              <p className="tabular-nums truncate text-sm text-carve-faint">
                {candidate.card_number} · {card?.rarity ?? ''} ·{' '}
                <Edition language={candidate.language} />
              </p>
            </div>
          </div>

          {candidate.ambiguous_printing && (
            <Link
              to={`/card/${encodeURIComponent(cardId)}?language=${candidate.language}`}
              className="pt-1 text-xs text-carve-dim underline"
            >
              {candidate.printings.length} tirages identiques — choisir lequel
            </Link>
          )}

          {/* Already held: say so and ask, rather than silently incrementing.
              Emptying a binder means scanning fast, and a card that quietly becomes
              a ×3 because it passed the lens twice is a mistake nobody notices.

              A question with two answers, and no stepper alongside them — adjusting a
              count is what the collection screen is for, and a third control here
              would only make the choice harder to read at scanning speed. */}
          <div className="mt-auto pt-3">
            {owned ? (
              <>
                <p className="t-code pb-2">
                  Déjà dans ta collection · ×{owned.quantity}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant={primary ? 'primary' : 'quiet'}
                    size={primary ? 'lg' : 'md'}
                    onClick={() => onAdd(candidate)}
                  >
                    Ajouter un exemplaire
                  </Button>
                  {primary && onSkip && (
                    <Button variant="ghost" size="lg" onClick={onSkip}>
                      Passer
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <Button
                variant={primary ? 'primary' : 'quiet'}
                size={primary ? 'lg' : 'md'}
                full={primary}
                onClick={() => onAdd(candidate)}
              >
                Ranger dans la collection
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
