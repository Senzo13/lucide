import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { site } from '../content/site'
import { carouselPresence, carouselS } from '../lib/chapters'
import { useAppStore } from '../store/useAppStore'

/**
 * The works chapter of the reference is not a grid of cards: the camera stands
 * inside the dark hall while big *curved* banners slide past on a carousel —
 * three of them visible at once, the ones at the edges bending away with the
 * room. This is that carousel, living in the same WebGL world as the room, so
 * the projects sit inside the space instead of floating on top of it.
 */

/** lateral distance between two banners, in world units */
const SPACING = 4.7
/** how much deeper each banner stands once it leaves the centre */
const RECEDE = 2.35
/** how far each banner turns to face the centre of the arc */
const TURN = THREE.MathUtils.degToRad(25)
/** how far ahead of the camera the banner in front stands */
const DEPTH = 3.7
/** height of one banner, as a fraction of the visible height at that depth */
const SIZE = 0.46
/** how much each banner curves (its own radius, in world units) */
const CURVE = 5.4
/** angular half-width of the banner geometry, in radians */
const GEOM_ARC = 1.06
/** the width the banner geometry has before it is scaled to the frame */
const NATURAL_CHORD = 2 * CURVE * Math.sin(GEOM_ARC / 2)

/** procedural poster for a project — no external imagery anywhere in the build */
function makePoster(project: (typeof site.projects)[number], index: number) {
  const w = 1024
  const h = 576
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const accent = project.accent
  const seed = (index + 3) * 1.7
  const rand = (i: number) => {
    const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453
    return v - Math.floor(v)
  }

  /* ground */
  const ground = ctx.createLinearGradient(0, 0, w, h)
  ground.addColorStop(0, '#0b0a18')
  ground.addColorStop(0.5, '#151131')
  ground.addColorStop(1, '#07060f')
  ctx.fillStyle = ground
  ctx.fillRect(0, 0, w, h)

  /* the project's colour, smeared across the sheet — a real poster has to
     read as a lit image at a glance, not as a swatch */
  ctx.globalAlpha = 0.34
  ctx.fillStyle = accent
  ctx.fillRect(0, 0, w, h)
  ctx.globalAlpha = 1

  const bloom = ctx.createRadialGradient(
    w * (0.3 + rand(1) * 0.4),
    h * (0.28 + rand(2) * 0.36),
    10,
    w * 0.5,
    h * 0.5,
    w * 0.72,
  )
  bloom.addColorStop(0, '#ffffff')
  bloom.addColorStop(0.18, accent)
  bloom.addColorStop(0.5, `${accent}88`)
  bloom.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalAlpha = 0.9
  ctx.fillStyle = bloom
  ctx.fillRect(0, 0, w, h)
  ctx.globalAlpha = 1

  /* a broad light wash so the banner never sits as a black rectangle */
  const wash = ctx.createLinearGradient(0, h, w, 0)
  wash.addColorStop(0, 'rgba(255,255,255,0.02)')
  wash.addColorStop(0.45, 'rgba(255,255,255,0.16)')
  wash.addColorStop(1, 'rgba(255,255,255,0.04)')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, w, h)

  /* wide diagonal bands, like the light shafts of the room */
  ctx.save()
  ctx.translate(w * 0.5, h * 0.5)
  ctx.rotate(-0.34)
  for (let i = 0; i < 7; i += 1) {
    const bw = 26 + rand(10 + i) * 74
    const bx = (rand(20 + i) - 0.5) * w * 1.45
    ctx.globalAlpha = 0.05 + rand(30 + i) * 0.12
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : accent
    ctx.fillRect(bx, -h, bw, h * 2)
  }
  ctx.restore()
  ctx.globalAlpha = 1

  /* fine technical grid */
  ctx.strokeStyle = 'rgba(255,255,255,0.14)'
  ctx.lineWidth = 1
  for (let x = 0; x <= w; x += 32) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
    ctx.stroke()
  }
  for (let y = 0; y <= h; y += 32) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }

  /* a couple of geometric marks so the sheet reads as artwork, not a swatch */
  ctx.strokeStyle = `${accent}cc`
  ctx.lineWidth = 3
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath()
    const cx = w * (0.2 + rand(40 + i) * 0.7)
    const cy = h * (0.2 + rand(50 + i) * 0.6)
    const r = 40 + rand(60 + i) * 150
    ctx.arc(cx, cy, r, rand(70 + i) * 6.28, rand(80 + i) * 6.28 + 1.2)
    ctx.stroke()
  }

  /* caption plate: the reference prints the title on a solid band */
  const plate = ctx.createLinearGradient(0, h - 150, 0, h)
  plate.addColorStop(0, 'rgba(4,3,10,0)')
  plate.addColorStop(0.45, 'rgba(4,3,10,0.72)')
  plate.addColorStop(1, 'rgba(4,3,10,0.92)')
  ctx.fillStyle = plate
  ctx.fillRect(0, h - 150, w, 150)

  /* index, title, client */
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = '600 118px "Inter Variable", Inter, Arial, sans-serif'
  ctx.fillText(project.index, 48, h - 52)

  ctx.font = '700 62px "Inter Variable", Inter, Arial, sans-serif'
  const title = project.title
  let size = 62
  while (ctx.measureText(title).width > w - 320 && size > 26) {
    size -= 4
    ctx.font = `700 ${size}px "Inter Variable", Inter, Arial, sans-serif`
  }
  ctx.fillStyle = '#ffffff'
  ctx.fillText(title, 190, h - 60)

  ctx.font = '400 22px "JetBrains Mono Variable", monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.62)'
  ctx.fillText(project.client.toUpperCase(), 190, h - 104)
  ctx.fillText(project.date, w - 190, h - 104)

  ctx.font = '400 20px "JetBrains Mono Variable", monospace'
  ctx.fillText(project.tags.join('  ·  ').toUpperCase(), 190, 68)
  ctx.fillText('LUCIDE', w - 150, 68)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.anisotropy = 4
  return texture
}

type Panel = {
  group: THREE.Group
  material: THREE.MeshBasicMaterial
  visible: number
}

export default function Panels() {
  const viewport = useThree((s) => s.viewport)
  const camera = useThree((s) => s.camera)
  const rootRef = useRef<THREE.Group>(null)
  const panelsRef = useRef<Panel[]>([])
  const texturesRef = useRef<THREE.CanvasTexture[]>([])
  const readyRef = useRef(false)

  /* geometry: a slice of a cylinder, so every banner bends with the room */
  const geometry = useMemo(() => {
    const geo = new THREE.CylinderGeometry(CURVE, CURVE, 1, 26, 1, true, -GEOM_ARC, GEOM_ARC * 2)
    geo.translate(0, 0, -CURVE)
    geo.computeVertexNormals()
    return geo
  }, [])

  useEffect(
    () => () => {
      geometry.dispose()
    },
    [geometry],
  )

  /* build one banner per project once the fonts are in */
  useEffect(() => {
    const build = () => {
      const root = rootRef.current
      if (!root || readyRef.current) return
      readyRef.current = true
      site.projects.forEach((project, index) => {
        const texture = makePoster(project, index)
        if (!texture) return
        texturesRef.current.push(texture)
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 0,
          toneMapped: false,
          side: THREE.DoubleSide,
        })
        const group = new THREE.Group()
        const mesh = new THREE.Mesh(geometry, material)
        group.add(mesh)
        root.add(group)
        panelsRef.current.push({ group, material, visible: 0 })
      })
    }
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    let cancelled = false
    const run = () => {
      if (!cancelled) build()
    }
    if (fonts) void fonts.ready.then(run)
    else run()
    return () => {
      cancelled = true
      panelsRef.current.forEach((p) => p.material.dispose())
      panelsRef.current = []
      texturesRef.current.forEach((t) => t.dispose())
      texturesRef.current = []
    }
  }, [geometry])

  useFrame((_, delta) => {
    const root = rootRef.current
    if (!root || !panelsRef.current.length) return

    const store = useAppStore.getState()
    const p = store.chapters.projets ?? -1
    const count = panelsRef.current.length
    const t = carouselS(p, count)
    /* fade the whole carousel in as the chapter takes over the viewport */
    const presence = carouselPresence(p)

    /* the arc of banners hangs in front of the camera, in world space, so it
       has to be sized at its own depth — not at the camera's target plane */
    const view = viewport.getCurrentViewport(camera, [
      camera.position.x,
      camera.position.y,
      camera.position.z - DEPTH,
    ])
    const size = view.height * SIZE
    const width = size * 1.75
    /* the geometry always has the same natural width: scaling it down to the
       frame is what keeps every banner the same size however far it stands */
    const xScale = width / NATURAL_CHORD

    panelsRef.current.forEach((panel, index) => {
      const delta_ = index - t
      const spread = Math.abs(delta_)
      /* depth ordering: the banner in front is the brightest, the ones at the
         edges fall away into the room */
      const target = presence * (spread < 0.5 ? 1 : 0.82)
      panel.visible += (target - panel.visible) * Math.min(1, delta * 6)
      panel.material.opacity = panel.visible
      panel.material.visible = panel.visible > 0.01

      /* every banner has the same *world* size: perspective then takes care of
         shrinking the ones that stand further back, exactly like the
         reference's arc of panels */
      panel.group.position.set(delta_ * SPACING, 0, -DEPTH - spread * RECEDE)
      panel.group.rotation.y = -delta_ * TURN
      panel.group.scale.set(xScale, size, 1)
    })

    root.position.copy(camera.position)
    root.position.y = 0.35
  })

  return <group ref={rootRef} renderOrder={-4} />
}
