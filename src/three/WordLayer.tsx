import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { blendPalette, createPalette } from './palette'
import { WORDS, wordForSection } from './words'

type Props = {
  /** how far down the room the wall stands, in world units */
  distance?: number
  /**
   * `far` is the wall itself (drawn behind the DOM content), `near` is the
   * faint copy that lives in the prism's canvas so the glass has something to
   * refract.
   */
  layer?: 'far' | 'near'
}

/** cap-height of the word as a fraction of the visible height at its depth */
const CAP = 0.42
/**
 * Ink width as a multiple of the visible width at that depth. The far wall is
 * wider than the frame (it is a wall); the near copy is scaled to sit exactly
 * under the DOM wordmark of the key visual, so the glass refracts *that* word
 * instead of a second, misaligned one.
 */
const SPREAD_FAR = 1.25
const SPREAD_NEAR = 1.25
/** where the cap-line sits, measured from the bottom of the viewport */
const CENTER = 0.52

const FONT = `700 400px "Inter Variable", Inter, "Helvetica Neue", Arial, sans-serif`

/**
 * Draws one word on a canvas so it can live in WebGL. The ink is white: the
 * material tints it per world (paper-black on the blueprint sheet).
 */
function makeWordTexture(word: string) {
  const canvas = document.createElement('canvas')
  const probe = canvas.getContext('2d')
  if (!probe) return null
  probe.font = FONT
  const metrics = probe.measureText(word)
  const ink = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent
  const pad = 400 * 0.18
  canvas.width = Math.ceil(metrics.width + pad * 2)
  canvas.height = Math.ceil(ink + pad * 2)

  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.font = FONT
  ctx.letterSpacing = '-0.005em'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(word, canvas.width / 2, pad + metrics.actualBoundingBoxAscent)

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
export default function WordLayer({ distance = 26, layer = 'far' }: Props) {
  const camera = useThree((s) => s.camera)
  const viewport = useThree((s) => s.viewport)
  const groupRef = useRef<THREE.Group>(null)
  const palette = useMemo(() => createPalette(), [])
  const [textures, setTextures] = useState<Record<string, THREE.CanvasTexture> | null>(null)
  const opacities = useRef<Record<string, number>>({})

  useEffect(() => {
    const build = () => {
      const next: Record<string, THREE.CanvasTexture> = {}
      for (const word of WORDS) {
        const texture = makeWordTexture(word)
        if (texture) next[word] = texture
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
      Object.values(textures).forEach((t) => t.dispose())
    },
    [textures],
  )

  const materials = useMemo(() => {
    const map: Record<string, THREE.MeshBasicMaterial> = {}
    for (const word of WORDS) {
      map[word] = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        blending: layer === 'near' ? THREE.AdditiveBlending : THREE.NormalBlending,
      })
      opacities.current[word] = 0
    }
    return map
  }, [layer])

  useEffect(
    () => () => {
      Object.values(materials).forEach((m) => m.dispose())
    },
    [materials],
  )

  /* the room is being dived into: the wall drifts up and sideways very slowly
     so the lettering never reads as a flat sticker */
  const drift = useRef({ x: 0, y: 0 })

  useFrame((_, delta) => {
    const store = useAppStore.getState()
    blendPalette(store.env, palette)
    const active = wordForSection(store.activeSection)
    const travel = store.env.travel

    for (const word of WORDS) {
      const material = materials[word]
      if (!material) continue
      const target = word === active ? palette.word : 0
      const current = opacities.current[word] ?? 0
      const next = current + (target - current) * Math.min(1, delta * 2.6)
      opacities.current[word] = next
      material.opacity = next
      /* dark ink on the light sheet, white light in the dark rooms */
      material.color.setRGB(
        0.94 + (0.06 - 0.94) * palette.sheet,
        0.95 + (0.07 - 0.95) * palette.sheet,
        1.0 + (0.2 - 1.0) * palette.sheet,
      )
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
  const spread = layer === 'near' ? SPREAD_NEAR : SPREAD_FAR

  return (
    <group ref={groupRef} position={[0, 0, -distance]} renderOrder={layer === 'near' ? -1 : -6}>
      {WORDS.map((word) => {
        const texture = textures[word]
        if (!texture) return null
        const inkRatio = (texture.userData.inkRatio as number) || 1
        const aspect = (texture.userData.aspect as number) || 4
        /* the *ink* spans `SPREAD` viewports: the padding around it must scale */
        const width = (view.width * spread) / Math.max(0.08, inkRatio)
        const height = width / aspect
        return (
          <mesh key={word} material={materials[word]} position={[0, y, 0]} frustumCulled={false}>
            <planeGeometry args={[width, height]} />
            <primitive object={texture} attach="material-map" />
          </mesh>
        )
      })}
    </group>
  )
}
