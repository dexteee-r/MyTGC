import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { usePrefersReducedMotion } from './Sky'

/* ── The Log Pose ───────────────────────────────────────────────────────────
   The scanner's idle state, ported from the design system's compass3d.js: a glass
   orb slung between two wooden caps on four turned legs, with a needle inside that
   never stops looking for a bearing.

   Geometry, materials and lights are the delivered values, unchanged. What is added
   here is where it is allowed to run: the loop is a WebGL render at animation frame
   rate, and the scanner is also the screen holding an open camera. So it mounts only
   while nothing is being read, and tears the context down the moment the camera
   takes over — a compass that keeps rendering behind a live viewfinder costs battery
   on the one screen where the phone is already working hardest.

   Reduced motion keeps the instrument but stops the sweep, which is the honest
   reading of the preference: the object is content, its drift is decoration.       */

function woodTexture(base: string, grain: string) {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = base
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = grain
  ctx.globalAlpha = 0.4
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * size + (Math.random() - 0.5) * 8
    ctx.lineWidth = 1 + Math.random() * 2
    ctx.beginPath()
    ctx.moveTo(a, 0)
    for (let y = 0; y <= size; y += 24) {
      ctx.lineTo(a + Math.sin(y / 34 + i) * 5 + (Math.random() - 0.5) * 3, y)
    }
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

/* The glass is shaded per-vertex rather than lit: a real transmissive material costs
   a second render pass, and at 150px nobody can tell. */
function glassGradient(geometry: THREE.BufferGeometry) {
  const position = geometry.attributes.position
  const colors = new Float32Array(position.count * 3)
  const normal = new THREE.Vector3()
  const base = new THREE.Color('#cfe8ff')
  const highlight = new THREE.Color('#ffffff')
  const shadow = new THREE.Color('#5c7c96')
  const highlightDir = new THREE.Vector3(-0.5, 0.6, 0.7).normalize()
  const shadowDir = new THREE.Vector3(0.6, -0.5, -0.6).normalize()
  for (let i = 0; i < position.count; i++) {
    normal.set(position.getX(i), position.getY(i), position.getZ(i)).normalize()
    const hl = Math.max(0, normal.dot(highlightDir))
    const sh = Math.max(0, normal.dot(shadowDir))
    const colour = base
      .clone()
      .lerp(highlight, Math.pow(hl, 3) * 0.8)
      .lerp(shadow, Math.pow(sh, 2) * 0.45)
    colors[i * 3] = colour.r
    colors[i * 3 + 1] = colour.g
    colors[i * 3 + 2] = colour.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

function needleHalf(length: number, width: number, depth: number) {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.lineTo(-width / 2, length * 0.22)
  shape.lineTo(0, length)
  shape.lineTo(width / 2, length * 0.22)
  shape.lineTo(0, 0)
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
  geometry.rotateX(-Math.PI / 2)
  return geometry
}

/* A turned leg: the profile is a lathe, which is what a turned leg actually is. */
function legGeometry() {
  const profile: [number, number][] = [
    [0.075, 0], [0.105, 0.04], [0.06, 0.14], [0.05, 0.3], [0.115, 0.46],
    [0.06, 0.58], [0.05, 0.74], [0.1, 0.9], [0.075, 1],
  ]
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    14,
  )
}

function mount(host: HTMLDivElement, reduced: boolean) {
  const width = host.clientWidth || 180
  const height = host.clientHeight || 180
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height)
  host.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100)
  camera.position.set(0, 1.7, 5.6)
  camera.lookAt(0, 1.05, 0)

  scene.add(new THREE.AmbientLight(0x40403f, 1.1))
  const key = new THREE.DirectionalLight(0xfff2d8, 1.3)
  key.position.set(4, 6, 4)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x88aaff, 0.5)
  rim.position.set(-5, 2, -4)
  scene.add(rim)

  const rig = new THREE.Group()
  scene.add(rig)

  const capThickness = 0.18
  const legHeight = 2.0
  const wood = woodTexture('#4a2e1a', '#2c1810')
  wood.repeat.set(3, 3)
  const woodMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.6, metalness: 0.08 })

  const capGeo = new THREE.CylinderGeometry(1.2, 1.2, capThickness, 48)
  rig.add(new THREE.Mesh(capGeo, woodMat))
  const topCap = new THREE.Mesh(capGeo, woodMat)
  topCap.position.y = capThickness + legHeight
  rig.add(topCap)

  const legGeo = legGeometry()
  for (const angle of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
    const leg = new THREE.Mesh(legGeo, woodMat)
    leg.scale.set(1, legHeight, 1)
    leg.position.set(0.95 * Math.cos(angle), capThickness / 2, 0.95 * Math.sin(angle))
    rig.add(leg)
  }

  const centreY = capThickness / 2 + legHeight / 2
  const sphereGeo = new THREE.SphereGeometry(0.92, 48, 32)
  glassGradient(sphereGeo)
  const sphereMat = new THREE.MeshStandardMaterial({
    vertexColors: true, transparent: true, opacity: 0.32, roughness: 0.08,
    metalness: 0.02, side: THREE.DoubleSide, depthWrite: false,
  })
  const sphere = new THREE.Mesh(sphereGeo, sphereMat)
  sphere.position.y = centreY
  rig.add(sphere)

  const needle = new THREE.Group()
  const northGeo = needleHalf(0.62, 0.24, 0.05)
  const northMat = new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.4, metalness: 0.15 })
  needle.add(new THREE.Mesh(northGeo, northMat))
  const southGeo = needleHalf(0.62, 0.24, 0.05)
  southGeo.rotateY(Math.PI)
  const southMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.1 })
  needle.add(new THREE.Mesh(southGeo, southMat))
  const pivotGeo = new THREE.SphereGeometry(0.07, 16, 16)
  const pivotMat = new THREE.MeshStandardMaterial({ color: 0xe0c48a, metalness: 0.8, roughness: 0.25 })
  needle.add(new THREE.Mesh(pivotGeo, pivotMat))
  needle.position.y = centreY
  rig.add(needle)

  let pointerX = 0
  let pointerY = 0
  const onPointer = (event: PointerEvent) => {
    const rect = host.getBoundingClientRect()
    pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointerY = ((event.clientY - rect.top) / rect.height) * 2 - 1
  }
  host.addEventListener('pointermove', onPointer)

  let current = 0
  let sweep = 0
  let last = performance.now()
  let frame = 0
  const animate = (time: number) => {
    frame = requestAnimationFrame(animate)
    const dt = Math.min((time - last) / 1000, 0.05)
    last = time
    const target = reduced ? 0 : (sweep = (sweep + dt * 14) % 360)
    const diff = ((((target - current + 540) % 360) - 180 + 360) % 360) - 180
    current += diff * Math.min(dt * 2.5, 1)
    needle.rotation.y = THREE.MathUtils.degToRad(-current)
    needle.position.y = centreY + Math.sin(time / 700) * 0.02
    if (!reduced) {
      rig.rotation.x = THREE.MathUtils.lerp(rig.rotation.x, pointerY * 0.08, 0.05)
      rig.rotation.y = THREE.MathUtils.lerp(rig.rotation.y, -pointerX * 0.25, 0.05)
    }
    renderer.render(scene, camera)
  }
  frame = requestAnimationFrame(animate)

  const onResize = () => {
    const w = host.clientWidth
    const h = host.clientHeight
    if (!w || !h) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  window.addEventListener('resize', onResize)

  return () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('resize', onResize)
    host.removeEventListener('pointermove', onPointer)
    wood.dispose()
    for (const geo of [capGeo, legGeo, sphereGeo, northGeo, southGeo, pivotGeo]) geo.dispose()
    for (const mat of [woodMat, sphereMat, northMat, southMat, pivotMat]) mat.dispose()
    renderer.dispose()
    if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement)
  }
}

export function LogPose3D({ className = '' }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (!host.current) return
    /* A device with no WebGL context must not take the screen down with it. */
    try {
      return mount(host.current, reduced)
    } catch {
      return undefined
    }
  }, [reduced])

  return <div ref={host} aria-hidden className={`mx-auto size-[190px] ${className}`} />
}
