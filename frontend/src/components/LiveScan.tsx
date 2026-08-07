import { useCallback, useEffect, useRef, useState } from 'react'
import type { Language, ScanResult } from '../lib/types'
import { api } from '../lib/api'

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
const COOLDOWN_MS = 1200 // minimum gap between two requests

export type LiveState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'denied' }
  | { kind: 'running'; hint: 'hold' | 'reading' }

export function LiveScan({
  language,
  paused,
  onResult,
}: {
  language: Language
  paused: boolean
  onResult: (result: ScanResult) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const probeRef = useRef<Uint8ClampedArray | null>(null)
  const stillSince = useRef<number>(0)
  const lastSent = useRef<number>(0)
  const inFlight = useRef(false)
  const [state, setState] = useState<LiveState>({ kind: 'starting' })

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

      probeCtx.drawImage(video, 0, 0, probe.width, probe.height)
      const current = probeCtx.getImageData(0, 0, probe.width, probe.height).data
      const previous = probeRef.current
      probeRef.current = current.slice()

      if (!previous) return
      let diff = 0
      for (let i = 0; i < current.length; i += 4) diff += Math.abs(current[i] - previous[i])
      const moved = diff / (current.length / 4) > 6

      const now = Date.now()
      if (moved) {
        stillSince.current = 0
        setState((s) => (s.kind === 'running' && s.hint !== 'hold' ? { kind: 'running', hint: 'hold' } : s))
        return
      }
      if (!stillSince.current) stillSince.current = now
      if (now - stillSince.current < IDLE_MS || now - lastSent.current < COOLDOWN_MS) return

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
      } catch {
        /* a dropped frame is not worth interrupting the run for */
      } finally {
        inFlight.current = false
        setState((s) => (s.kind === 'running' ? { kind: 'running', hint: 'hold' } : s))
      }
    }, 180)

    return () => window.clearInterval(tick)
  }, [state.kind, paused, language, onResult])

  if (state.kind === 'unsupported' || state.kind === 'denied') {
    return (
      <div className="mx-5 rounded-none border border-rail/60 p-4 text-sm text-label-dim">
        {state.kind === 'denied'
          ? "Accès caméra refusé. Autorise-le dans les réglages du navigateur, ou reste en mode photo."
          : state.reason}
      </div>
    )
  }

  return (
    <div className="relative mx-5 overflow-hidden rounded-none bg-black">
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
            : 'Aligne la carte dans le cadre et garde la main immobile'}
      </p>
    </div>
  )
}
