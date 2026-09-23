import { useEffect, useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { site } from '../content/site'
import { useAppStore } from '../store/useAppStore'

/** where the DOM wordmark sits, mirrored here so the crystal refracts it
 *  (cap-height centre at 48% of the viewport, see Hero.css) */
const WORD_TOP = 0.481
/** fraction of the viewport width spanned by the DOM wordmark ink */
const WORD_WIDTH = 0.686
const GHOST_Z = -0.85

/**
 * A second copy of the wordmark living inside the WebGL layer, parked behind
 * the crystal so the glass actually refracts the letters — additive violet, so
 * it disappears where it overlaps the real (white) DOM letters.
 */
export default function WordmarkGhost() {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(null)
  const viewport = useThree((s) => s.viewport)
  const camera = useThree((s) => s.camera)
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        color: new THREE.Color('#ffffff'),
        toneMapped: false,
      }),
    [],
  )

  useEffect(() => {
    let cancelled = false
    let created: THREE.CanvasTexture | null = null

    const draw = () => {
      const canvas = document.createElement('canvas')
      const probe = canvas.getContext('2d')
      if (!probe) return
      const fontSize = 420
      /* Must mirror the DOM wordmark exactly — same family and weight as
         `--font-wordmark` / `--fw-wordmark` in `tokens.css`, otherwise the
         letters refracted by the glass do not line up with the DOM ones. */
      const font = `700 ${fontSize}px "Inter Variable", Inter, "Helvetica Neue", Arial, sans-serif`
      probe.font = font
      const measured = probe.measureText(site.name).width
      const pad = fontSize * 0.35
      canvas.width = Math.ceil(measured + pad * 2)
      canvas.height = Math.ceil(fontSize * 1.45)

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.font = font
      ctx.letterSpacing = '-0.004em'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      /* crisp white ink: it only exists so the glass has something to refract,
         and it must not add a halo around the DOM letters */
      ctx.fillStyle = 'rgba(255, 255, 255, 1)'
      ctx.strokeStyle = 'rgba(255, 255, 255, 1)'
      ctx.lineWidth = 10
      ctx.strokeText(site.name, canvas.width / 2, canvas.height / 2)
      ctx.fillText(site.name, canvas.width / 2, canvas.height / 2)

      const tex = new THREE.CanvasTexture(canvas)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.minFilter = THREE.LinearFilter
      tex.anisotropy = 4
      tex.userData.ratio = canvas.width / canvas.height
      tex.userData.letters = measured / canvas.width
      created = tex
      if (!cancelled) setTexture(tex)
    }

    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    if (fonts) void fonts.ready.then(draw)
    else draw()

    return () => {
      cancelled = true
      created?.dispose()
    }
  }, [])

  /* keep the ghost exactly on the DOM wordmark's screen size */
  const depth = (camera.position.z - GHOST_Z) / camera.position.z
  const letters = (texture?.userData.letters as number) || 1
  const planeWidth = (viewport.width * WORD_WIDTH * depth) / letters
  const planeHeight = texture ? planeWidth / (texture.userData.ratio as number) : 0
  const y = -(WORD_TOP - 0.5) * viewport.height * depth

  useFrame(() => {
    /* deliberately faint: this layer only exists so the glass has something to
       refract — anything brighter shows up as a halo around the DOM letters */
    const target = useAppStore.getState().loaded ? 0.032 : 0
    material.opacity += (target - material.opacity) * 0.06
  })

  /* only mirrors the DOM wordmark on wide screens — hidden on mobile layouts */
  if (!texture || viewport.width < 5) return null

  return (
    <mesh position={[0, y, GHOST_Z]} material={material} renderOrder={-2}>
      <planeGeometry args={[planeWidth, planeHeight]} />
      <primitive object={texture} attach="material-map" />
    </mesh>
  )
}
