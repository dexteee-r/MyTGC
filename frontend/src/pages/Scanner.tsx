import { Suspense, lazy, useCallback, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LiveScan } from '../components/LiveScan'
import { CameraIcon } from '../components/icons'
import {
  Adrift,
  Button,
  ColorBar,
  EmptyState,
  PageHeader,
  ScanMiss,
  Screen,
  Segmented,
  Sounding,
} from '../components/ui'
import { Moment, momentLine, type MomentKind } from '../components/Moment'
import { api, imageUrl } from '../lib/api'
import { useCollection } from '../lib/collection'
import { LANGUAGE_OPTIONS, useLanguage } from '../lib/language'
import { useToast } from '../lib/toast'
import type { Language, Pack, ScanCandidate, ScanResult } from '../lib/types'
import type { ScanFailure } from '../components/ui'
import { Edition, EditionName } from '../components/Edition'

/* three.js is 146 kB gzipped and it draws one object on one screen. Loaded eagerly it
   would be the largest thing in the bundle and would be paid for by every cold start,
   including the ones that never open the scanner. Its own chunk, fetched when the
   scanner goes idle. */
const LogPose3D = lazy(() =>
  import('../components/LogPose3D').then((m) => ({ default: m.LogPose3D })),
)

type Mode = 'live' | 'photo'

/* Rarities that are worth remarking on. Common, Uncommon and Rare are most of the
   catalogue; these are the ones a collector stops at. */
const SCARCE = new Set(['SuperRare', 'SecretRare', 'TreasureRare', 'Special'])

/* The pack list, asked for once per edition. Working out whether a card is the first
   of its set — or the last one missing — needs the set's totals, and the alternative
   is a request on every single add during a run through a binder. */
const packs: Record<string, Promise<Pack[]>> = {}
const packList = (language: Language) =>
  (packs[language] ??= api.packs(language).catch(() => []))

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
  const [moment, setMoment] = useState<{ kind: MomentKind; line: string; at: number } | null>(null)
  const [missed, setMissed] = useState<ScanFailure | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const capture = () => inputRef.current?.click()

  /* `detected` says the frame held a card, so the two failures are different things
     and deserve different advice: nothing in the frame, versus a card the catalogue
     does not know. */
  const failureOf = (scan: ScanResult): ScanFailure | null =>
    scan.detected && scan.candidates.length === 0
      ? 'unknown'
      : !scan.detected
        ? 'none'
        : null

  const onLiveResult = useCallback((incoming: ScanResult) => {
    // Freeze on the first hit and let the user confirm. Auto-adding from a live
    // stream would put cards in the collection that were only ever pointed at.
    setResult((current) => current ?? incoming)
  }, [])

  const submit = async (file: File) => {
    setBusy(true)
    setError(null)
    setResult(null)
    setMissed(null)
    try {
      const scan = await api.scan(file, language)
      const failure = failureOf(scan)
      if (failure) setMissed(failure)
      else setResult(scan)
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

    /* Undo stays available whatever the card did — the moment is a flourish over the
       top of it, never a replacement for being able to take it back. */
    show(before ? `${candidate.name} · ${before.quantity + 1}e` : `${candidate.name} rangée`, () => {
      const owned = ownedOf(cardId, candidate.language)
      if (owned) setQuantity(cardId, candidate.language, owned.quantity - 1)
      setSession((n) => Math.max(0, n - 1))
    })

    const kind = await outcomeOf(candidate, before?.quantity)
    setMoment({
      kind,
      line: momentLine(kind, {
        name: candidate.name,
        rarity: candidate.card?.rarity ?? candidate.printings[0]?.rarity,
        packCode: candidate.card?.pack_code ?? candidate.printings[0]?.pack_code,
        packSize: kind === 'complete' ? await packSize(candidate) : undefined,
        had: before?.quantity,
      }),
      at: Date.now(),
    })

    setResult(null)
    // Live keeps running on its own; photo needs re-arming to save a tap per card.
    if (mode === 'photo') capture()
  }

  /* Which of the five registers this add earned, most notable first. Completing a
     set outranks the card being the first of one, which outranks it being rare. */
  const outcomeOf = async (candidate: ScanCandidate, had?: number): Promise<MomentKind> => {
    if (had) return 'duplicate'
    const code = candidate.card?.pack_code ?? candidate.printings[0]?.pack_code
    const pack = code
      ? (await packList(candidate.language)).find((p) => p.pack_code === code)
      : undefined
    if (pack) {
      if (pack.owned_count + 1 >= pack.card_count) return 'complete'
      if (pack.owned_count === 0) return 'first'
    }
    const rarity = candidate.card?.rarity ?? candidate.printings[0]?.rarity
    return rarity && SCARCE.has(rarity) ? 'rare' : 'new'
  }

  const packSize = async (candidate: ScanCandidate) => {
    const code = candidate.card?.pack_code ?? candidate.printings[0]?.pack_code
    const pack = code
      ? (await packList(candidate.language)).find((p) => p.pack_code === code)
      : undefined
    return pack?.card_count
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

      {mode === 'photo' && !result && !busy && !missed && (
        <>
          <Suspense fallback={<div className="mx-auto size-[190px]" />}>
            <LogPose3D />
          </Suspense>
          <div className="px-5 pt-5">
            <Button variant="primary" size="lg" full onClick={capture}>
              <CameraIcon className="size-5" />
              Prendre une photo
            </Button>
          </div>
        </>
      )}

      {!result && !busy && !missed && (
        <p className="px-5 pt-3 text-sm text-[var(--text-secondary)]">
          Une carte seule, à plat, entière dans le cadre. L'édition{' '}
          <span className="font-semibold text-[var(--text-primary)]">
            <EditionName language={language} />
          </span>{' '}
          est celle qui sera enregistrée — l'illustration est identique dans les deux, elle
          ne peut pas être devinée.
        </p>
      )}

      {busy && <div className="pt-6"><Sounding label="Lecture de la carte" /></div>}

      {missed && !busy && (
        <div className="pt-4">
          <ScanMiss
            reason={missed}
            onRetry={() => {
              setMissed(null)
              if (mode === 'photo') capture()
            }}
            onManual={() => navigate('/search')}
          />
        </div>
      )}

      {error && !busy && (
        <div className="pt-4">
          <Adrift onRetry={capture}>
            Le serveur n'a pas répondu. Ta collection reste consultable ; c'est la
            reconnaissance qui attend la liaison.
          </Adrift>
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

      {moment && (
        <Moment
          kind={moment.kind}
          line={moment.line}
          trigger={moment.at}
          onDone={() => setMoment(null)}
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
      className={`mx-5 mt-2 rounded-[2px] p-3 ${primary ? 'deck' : 'sunken'}`}
    >
      {primary && !confident && (
        <p className="pb-2 text-xs text-[var(--text-secondary)]">
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
            <ColorBar colors={card?.colors ?? []} className="mt-1 h-8 w-[3px]" />
            <div className="min-w-0">
              <p className={`truncate font-semibold ${primary ? 'text-lg' : ''}`}>
                {candidate.name}
              </p>
              <p className="tabular-nums truncate text-sm text-[var(--text-faint)]">
                {candidate.card_number} · {card?.rarity ?? ''} ·{' '}
                <Edition language={candidate.language} />
              </p>
            </div>
          </div>

          {candidate.ambiguous_printing && (
            <Link
              to={`/card/${encodeURIComponent(cardId)}?language=${candidate.language}`}
              className="pt-1 text-xs text-[var(--text-secondary)] underline"
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
