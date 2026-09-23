import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { blendPalette, createPalette } from './palette'
import { createRoom, sampleRoom } from './mood'
import { WORDS, wordForSection, wordWeight } from './words'

/** the lettering is the room's own light, and the sheet's own ink */
const INK_SHEET = new THREE.Color('#0f1016')

type Props = {
  /** how far down the room the wall stands, in world units */
  distance?: number
}

/** cap-height of the word as a fraction of the visible height at its depth */
const CAP = 0.42
/**
 * Ink width as a multiple of the visible width at that depth: the wall is wider
 * than the frame, so the word bleeds off both edges and reads as lettering
 * painted on a surface rather than a caption floating in the middle.
 */
const SPREAD = 1.25
/** where the cap-line sits, measured from the bottom of the viewport */
const CENTER = 0.52

const FONT = `700 400px "Inter Variable", Inter, "Helvetica Neue", Arial, sans-serif`

/** the two inks of one word: solid mark and hairline contour */
type InkSet = { fill: THREE.CanvasTexture; line: THREE.CanvasTexture }

/**
 * Draws one word on a canvas so it can live in WebGL. The ink is white: the
 * material tints it per world (paper-black on the blueprint sheet).
 *
 * Two inks exist because the reference has two: a solid mark for the key
 * visual, and — everywhere below it — the hairline contour of the blueprint
 * sheets (`VISION`, `ABOUT`), which is what lets copy sit on top of the
 * lettering without a fight.
 */
function makeWordTexture(word: string, ink: 'fill' | 'line') {
  const canvas = document.createElement('canvas')
  const probe = canvas.getContext('2d')
  if (!probe) return null
  probe.font = FONT
  const metrics = probe.measureText(word)
  const stroke = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
  const pad = 400 * 0.18
  canvas.width = Math.ceil(metrics.width + pad * 2)
  canvas.height = Math.ceil(stroke + pad * 2)

  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.font = FONT
  ctx.letterSpacing = '-0.005em'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const baseline = pad + metrics.actualBoundingBoxAscent
  if (ink === 'line') {
    /* a hairline at 400px: 4px maps to ~3.7px once the word is blown up to
       ~1.9k wide, which lands on the reference's stroke weight */
    ctx.lineWidth = 4
    ctx.strokeStyle = '#ffffff'
    ctx.strokeText(word, canvas.width / 2, baseline)
  } else {
    ctx.fillStyle = '#ffffff'
    ctx.fillText(word, canvas.width / 2, baseline)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.anisotropy = 4
  /* how much of the canvas the ink actually occupies, and its proportions */
  texture.userData.inkRatio = metrics.width / canvas.width
  texture.userData.aspect = canvas.width / canvas.height
  return texture
}

/**
 * The giant wordmark of each chapter, standing at the end of the room. Because
 * the camera keeps travelling, the wall is parented to it: the lettering stays
 * far ahead while the floor and the mosaic stream past underneath — exactly the
 * way the reference keeps its word behind the glass for the whole dive.
 */
export default function WordLayer({ distance = 26 }: Props) {
  const camera = useThree((s) => s.camera)
  const viewport = useThree((s) => s.viewport)
  const groupRef = useRef<THREE.Group>(null)
  const palette = useMemo(() => createPalette(), [])
  const room = useMemo(() => createRoom(), [])
  /** scratch ink, reused every frame — the loop never allocates */
  const inkColor = useMemo(() => new THREE.Color(), [])
  const [textures, setTextures] = useState<Record<string, InkSet> | null>(null)
  const opacities = useRef<Record<string, number>>({})
  /** 0 = solid ink, 1 = hairline contour — eased so a chapter change never cuts */
  const styleMix = useRef(0)

  useEffect(() => {
    const build = () => {
      const next: Record<string, InkSet> = {}
      for (const word of WORDS) {
        const fill = makeWordTexture(word, 'fill')
        const line = makeWordTexture(word, 'line')
        if (fill && line) next[word] = { fill, line }
      }
      setTextures(next)
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
    }
  }, [])

  useEffect(
    () => () => {
      if (!textures) return
      Object.values(textures).forEach(({ fill, line }) => {
        fill.dispose()
        line.dispose()
      })
    },
    [textures],
  )

  const materials = useMemo(() => {
    const make = () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        blending: THREE.NormalBlending,
      })
    const fill: Record<string, THREE.MeshBasicMaterial> = {}
    const line: Record<string, THREE.MeshBasicMaterial> = {}
    for (const word of WORDS) {
      fill[word] = make()
      line[word] = make()
      opacities.current[word] = 0
    }
    return { fill, line }
  }, [])

  useEffect(
    () => () => {
      Object.values(materials.fill).forEach((m) => m.dispose())
      Object.values(materials.line).forEach((m) => m.dispose())
    },
    [materials],
  )

  /* the room is being dived into: the wall drifts up and sideways very slowly
     so the lettering never reads as a flat sticker */
  const drift = useRef({ x: 0, y: 0 })

  useFrame((state, delta) => {
    const store = useAppStore.getState()
    blendPalette(store.env, palette)
    const section = store.activeSection
    const active = wordForSection(section)
    const travel = store.env.travel
    const weight = wordWeight(section)
    /* The ink follows the *world*, not the chapter — that is what the reference
       does: in the dark hall the giant word is a solid dim mass parked behind
       the glass ("WORKS" behind the prism), and on the light blueprint sheet
       it turns into the hairline contour only (`VISION`, `ABOUT`). `sheet` is
       already a smooth 0→1 blend between those two rooms, so the ink crosses
       over with the world instead of cutting at a section boundary. */
    const wantOutline = palette.sheet
    styleMix.current += (wantOutline - styleMix.current) * Math.min(1, delta * 1.4)
    const outline = styleMix.current

    /* The large word is the slowest thing in the frame on purpose: it should
       read as lettering painted on the wall of a moving film, not as a caption
       being swapped. Both the ink and the crossfade between chapters are
       therefore eased over about a second — but the ink takes the room's
       colour straight away, because the wall it is painted on does. */
    sampleRoom(state.clock.elapsedTime, room)
    const ink = inkColor.copy(room.major).lerp(INK_SHEET, palette.sheet)

    for (const word of WORDS) {
      const fillMaterial = materials.fill[word]
      const lineMaterial = materials.line[word]
      if (!fillMaterial || !lineMaterial) continue
      const target = word === active ? palette.word * weight : 0
      const current = opacities.current[word] ?? 0
      const next = current + (target - current) * Math.min(1, delta * 1.4)
      opacities.current[word] = next
      fillMaterial.opacity = next * (1 - outline)
      lineMaterial.opacity = next * outline
      fillMaterial.color.copy(ink)
      lineMaterial.color.copy(ink)
    }

    drift.current.x = Math.sin(travel * 2.4) * 0.8
    drift.current.y = travel * 2.2 - store.scroll.heroProgress * 0.6

    const group = groupRef.current
    if (!group) return
    group.position.set(
      camera.position.x * 0.35 + drift.current.x,
      drift.current.y,
      camera.position.z - distance,
    )
  })

  if (!textures) return null

  /* world-space size of one word at the wall's depth, for this camera */
  const view = viewport.getCurrentViewport(camera, [0, 0, camera.position.z - distance])
  const y = (CENTER - 0.5) * view.height

  return (
    <group ref={groupRef} position={[0, 0, -distance]} renderOrder={-6}>
      {WORDS.map((word) => {
        const set = textures[word]
        if (!set) return null
        const inkRatio = (set.fill.userData.inkRatio as number) || 1
        const aspect = (set.fill.userData.aspect as number) || 4
        /* the *ink* spans `SPREAD` viewports: the padding around it must scale */
        const width = (view.width * SPREAD) / Math.max(0.08, inkRatio)
        const height = width / aspect
        return (
          <group key={word} position={[0, y, 0]}>
            <mesh material={materials.fill[word]} frustumCulled={false}>
              <planeGeometry args={[width, height]} />
              <primitive object={set.fill} attach="material-map" />
            </mesh>
            <mesh material={materials.line[word]} frustumCulled={false}>
              <planeGeometry args={[width, height]} />
              <primitive object={set.line} attach="material-map" />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}
