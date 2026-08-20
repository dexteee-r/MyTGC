import { useCallback, useEffect, useRef, useState } from 'react'
import type { Language, ScanResult } from '../lib/types'
import { ApiError, api } from '../lib/api'
import { frameHasSubject } from '../lib/frame'

/* Continuous scanning: the camera stays open and frames are sent as they settle,
   so a card is identified by pointing at it rather than by taking a photo.

   PROJECT_CONTEXT.md section 3 keeps recognition server-side, and it stays there —
   frames are captured, downscaled and POSTed exactly like a photo. The only work
   done in the browser is deciding *when* to send: a mean-absolute-difference
   between two downscaled frames, which is arithmetic on a 40x56 grid, not vision.
   Without it the stream would either flood the server ten times a second or send
   motion-blurred frames that cannot match. */

const FRAME_WIDTH = 1100 // what gets POSTed; detection downscales again server-side
const PROBE = 40 // grid used for the stillness test
const IDLE_MS = 420 // how long the view must hold still before a frame is sent
const COOLDOWN_MS = 1200 // minimum gap between two requests, before the server has its say

/* A hand rarely holds a phone perfectly still, and on some devices sensor noise or
   continuous autofocus hunting alone can keep the frame-to-frame diff above the
   movement threshold indefinitely -- reported live: the camera opened and stayed on
   "Aligne la carte... garde la main immobile" forever, never once sending a frame,
   on a device the movement threshold was never tuned against. Past this long spent
   continuously "moving", the wait for stillness is abandoned and a frame goes out
   regardless: a slightly motion-blurred attempt beats a scanner that silently never
   tries at all. */
const FORCE_STILL_MS = 3000

/* Pulled out of the tick loop so the one thing genuinely easy to get wrong here --
   the escape hatch that stops the scanner waiting for stillness forever -- is pinned
   by a test, not just eyeballed once on a phone. Returns the next `movingSince` to
   store (0 once genuinely still, so a later bout of motion starts its own fresh
   FORCE_STILL_MS clock rather than inheriting this one's) alongside whether the
   caller should keep waiting. */
export function stillnessGate(
  moved: boolean,
  movingSince: number,
  now: number,
): { wait: boolean; movingSince: number } {
  const nextMovingSince = moved ? movingSince || now : 0
  const treatAsStill = !moved || now - nextMovingSince >= FORCE_STILL_MS
  return { wait: !treatAsStill, movingSince: nextMovingSince }
}

/* Pace from the server's own limit rather than a constant of our own. A cooldown that
   outruns the rate limit spends the session collecting 429s — which is exactly how the
   scanner broke — and the two numbers live in different files, so the only way they
   stay in step is if one asks the other. Asked once per page load: the limit does not
   move while the app is open, and toggling between live and photo should not re-ask. */
let pacing: Promise<number> | null = null

function scanCooldown() {
  pacing ??= api
    .health()
    .then(({ scan_rate_limit, scan_window_seconds }) =>
      scan_rate_limit && scan_window_seconds
        ? Math.max(COOLDOWN_MS, Math.ceil(((scan_window_seconds * 1000) / scan_rate_limit) * 1.15))
        : COOLDOWN_MS,
    )
    .catch(() => COOLDOWN_MS)
  return pacing
}

export type LiveState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'denied' }
  | { kind: 'running'; hint: 'hold' | 'reading' | 'throttled' | 'empty' }

export function LiveScan({
  language,
  paused,
  onResult,
  onFallback,
}: {
  language: Language
  paused: boolean
  onResult: (result: ScanResult) => void
  onFallback?: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const probeRef = useRef<Uint8ClampedArray | null>(null)
  const stillSince = useRef<number>(0)
  const movingSince = useRef<number>(0)
  const lastSent = useRef<number>(0)
  const inFlight = useRef(false)
  const backoffUntil = useRef(0)
  const cooldown = useRef(COOLDOWN_MS)
  const [state, setState] = useState<LiveState>({ kind: 'starting' })

  useEffect(() => {
    scanCooldown().then((ms) => {
      cooldown.current = ms
    })
  }, [])

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    let cancelled = false

    const start = async () => {
      if (!window.isSecureContext) {
        setState({
          kind: 'unsupported',
          reason:
            "La caméra en continu exige une connexion sécurisée. Sur http, seul le mode photo fonctionne.",
        })
        return
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setState({ kind: 'unsupported', reason: 'Ce navigateur ne donne pas accès à la caméra.' })
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
          audio: false,
        })
        if (cancelled) return stream.getTracks().forEach((t) => t.stop())
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setState({ kind: 'running', hint: 'hold' })
      } catch (error) {
        setState(
          (error as DOMException)?.name === 'NotAllowedError'
            ? { kind: 'denied' }
            : { kind: 'unsupported', reason: "La caméra n'a pas pu démarrer." },
        )
      }
    }

    start()
    return () => {
      cancelled = true
      stop()
    }
  }, [stop])

  useEffect(() => {
    if (state.kind !== 'running') return
    const probe = document.createElement('canvas')
    probe.width = PROBE
    probe.height = Math.round(PROBE * 1.4)
    const probeCtx = probe.getContext('2d', { willReadFrequently: true })!

    const tick = window.setInterval(async () => {
      const video = videoRef.current
      if (!video || video.readyState < 2 || paused || inFlight.current) return
      if (Date.now() < backoffUntil.current) return

      probeCtx.drawImage(video, 0, 0, probe.width, probe.height)
      const current = probeCtx.getImageData(0, 0, probe.width, probe.height).data
      const previous = probeRef.current
      probeRef.current = current.slice()

      if (!previous) return
      let diff = 0
      for (let i = 0; i < current.length; i += 4) diff += Math.abs(current[i] - previous[i])
      const moved = diff / (current.length / 4) > 6

      const now = Date.now()
      const gate = stillnessGate(moved, movingSince.current, now)
      movingSince.current = gate.movingSince
      if (gate.wait) {
        stillSince.current = 0
        setState((s) => (s.kind === 'running' && s.hint !== 'hold' ? { kind: 'running', hint: 'hold' } : s))
        return
      }
      if (!stillSince.current) stillSince.current = now
      if (now - stillSince.current < IDLE_MS || now - lastSent.current < cooldown.current) return

      /* A still view is not the same as a view with a card in it. Most of a scanning
         session is the lens pointed at a table between two cards, and each of those
         frames was costing an upload, a detection pass and a hash for a guaranteed
         "nothing in the frame". The gate is one statistic over the grid already
         computed above, and it is deliberately conservative: sending an empty frame
         costs a request, skipping a real card costs the user a scan. */
      if (!frameHasSubject(current, probe.width, probe.height)) {
        setState((s) =>
          s.kind === 'running' && s.hint !== 'empty' ? { kind: 'running', hint: 'empty' } : s,
        )
        return
      }

      const width = FRAME_WIDTH
      const height = Math.round((video.videoHeight / video.videoWidth) * width)
      const frame = document.createElement('canvas')
      frame.width = width
      frame.height = height
      frame.getContext('2d')!.drawImage(video, 0, 0, width, height)

      const blob = await new Promise<Blob | null>((resolve) =>
        frame.toBlob(resolve, 'image/jpeg', 0.82),
      )
      if (!blob) return

      inFlight.current = true
      lastSent.current = Date.now()
      setState({ kind: 'running', hint: 'reading' })
      try {
        const result = await api.scan(new File([blob], 'frame.jpg', { type: 'image/jpeg' }), language)
        if (result.detected && result.candidates.length > 0) onResult(result)
        setState({ kind: 'running', hint: 'hold' })
      } catch (error) {
        /* A dropped frame is not worth interrupting the run for — but being turned
           away is. Swallowing a 429 left the camera running and identifying nothing,
           which looks exactly like a broken scanner. */
        const status = error instanceof ApiError ? error.status : 0
        if (status === 429 || status === 503) {
          backoffUntil.current = Date.now() + 8000
          setState({ kind: 'running', hint: 'throttled' })
        } else {
          setState({ kind: 'running', hint: 'hold' })
        }
      } finally {
        inFlight.current = false
      }
    }, 180)

    return () => window.clearInterval(tick)
  }, [state.kind, paused, language, onResult])

  if (state.kind === 'unsupported' || state.kind === 'denied') {
    return (
      <div className="sunken mx-5 p-4 text-sm text-[var(--text-secondary)]">
        {state.kind === 'denied'
          ? 'Accès caméra refusé. Autorise-le dans les réglages du navigateur.'
          : state.reason}
        {onFallback && (
          <button onClick={onFallback} className="mt-3 block underline">
            Passer en mode photo
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="relative mx-5 overflow-hidden rounded-[14px] bg-sea-deep" style={{ boxShadow: 'var(--shadow-float)' }}>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="block aspect-[3/4] w-full object-cover"
      />
      {/* Guide frame. The scoped-out case is a card among other cards, so the
          frame tells the user to isolate one — the constraint made visible
          rather than written in a paragraph nobody reads. */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="h-[68%] aspect-[600/838] rounded-lg border-2 border-white/70 shadow-[0_0_0_100vmax_rgba(0,0,0,0.42)]" />
      </div>
      <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pt-8 pb-3 text-center text-sm text-white">
        {state.kind !== 'running'
          ? 'Démarrage de la caméra…'
          : state.hint === 'reading'
            ? 'Lecture…'
            : state.hint === 'throttled'
              ? 'Le serveur demande une pause. Reprise dans quelques secondes.'
              : state.hint === 'empty'
                ? 'Rien dans le cadre — pose une carte devant l’objectif'
                : 'Aligne la carte dans le cadre et garde la main immobile'}
      </p>
    </div>
  )
}
