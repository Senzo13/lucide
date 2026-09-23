import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { blendPalette, createPalette } from './palette'

/**
 * The corridor props: flat technical panels hanging in the space, streaming
 * past the camera as the page scrolls. They are what gives the dive its
 * parallax — the reference page flies through the same kind of hanging frames
 * while the editorial content reads on top of the live scene.
 */
const COUNT = 18
const SPACING = 5.4
const SPAN = COUNT * SPACING
/** outline (4) + horizontal rule + vertical rule */
const SEGMENTS = 6
const VERTS = SEGMENTS * 2

const vertexShader = /* glsl */ `
  attribute float aFade;
  varying float vFade;
  void main() {
    vFade = aFade;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;
  varying float vFade;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    float a = vFade * uOpacity;
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor * a * 1.9, a);
  }
`

export default function Corridor() {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const palette = useMemo(() => createPalette(), [])

  const geometry = useMemo(() => {
    const position = new Float32Array(COUNT * VERTS * 3)
    const fade = new Float32Array(COUNT * VERTS)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geo.setAttribute('aFade', new THREE.BufferAttribute(fade, 1))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 200)
    return geo
  }, [])

  /* half-size of each panel, and how far off-axis it hangs: the corridor reads
     as a walkway of screens rather than a tunnel of identical hoops. The local
     geometry never changes — only the depth and the fade do — so it is built
     once, outside the frame loop. */
  const layout = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => {
        const side = i % 2 === 0 ? -1 : 1
        const panel = {
          x: side * (2.4 + Math.random() * 1.9),
          y: -0.5 + (Math.random() - 0.15) * 2.4,
          w: 1.5 + Math.random() * 1.9,
          h: 0.95 + Math.random() * 1.5,
          tilt: (Math.random() - 0.5) * 0.22,
        }
        const cos = Math.cos(panel.tilt)
        const sin = Math.sin(panel.tilt)
        const corners: [number, number][] = [
          [-panel.w, -panel.h],
          [panel.w, -panel.h],
          [panel.w, panel.h],
          [-panel.w, panel.h],
        ]
        /* outline + a horizontal and a vertical rule: it reads as a technical
           panel hanging in the space rather than a plain rectangle */
        const segments: [[number, number], [number, number]][] = [
          [corners[0], corners[1]],
          [corners[1], corners[2]],
          [corners[2], corners[3]],
          [corners[3], corners[0]],
          [
            [-panel.w, -panel.h * 0.15],
            [panel.w, -panel.h * 0.15],
          ],
          [
            [-panel.w * 0.32, -panel.h],
            [-panel.w * 0.32, panel.h],
          ],
        ]
        return {
          x: panel.x,
          y: panel.y,
          cos,
          sin,
          points: segments.flatMap(([a, b]) => [a, b]),
        }
      }),
    [],
  )

  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#8b8cf0') },
      uOpacity: { value: 0.62 },
    }),
    [],
  )

  useFrame(({ camera }) => {
    if (!materialRef.current) return

    const store = useAppStore.getState()
    blendPalette(store.env, palette)
    uniforms.uColor.value.copy(palette.line).lerp(palette.glow, 0.5)
    /* the sheet world keeps them barely there so the paper stays clean */
    uniforms.uOpacity.value = 0.62 * (1 - palette.sheet * 0.8)

    const position = geometry.attributes.position as THREE.BufferAttribute
    const fadeAttr = geometry.attributes.aFade as THREE.BufferAttribute
    const arr = position.array as Float32Array
    const fades = fadeAttr.array as Float32Array

    const camZ = camera.position.z
    let v = 0
    for (let i = 0; i < COUNT; i += 1) {
      const panel = layout[i]
      /* wrap the panel relative to the camera: it approaches, slips behind the
         near plane (where it is invisible) and is recycled far ahead again, so
         the corridor never runs out however deep the page dives */
      const base = i * SPACING
      const phase = (((camZ - base) % SPAN) + SPAN) % SPAN
      const distance = phase - 4
      const z = camZ - distance
      /* fades in off the near plane and dissolves with distance, so the panel
         never pops into view or dies on a hard edge */
      const near = Math.min(1, Math.max(0, (distance - 2.5) / 6))
      const far = 1 - Math.min(1, Math.max(0, (distance - 26) / 26))
      const fade = near * far
      for (const p of panel.points) {
        arr[v * 3] = panel.x + p[0] * panel.cos - p[1] * panel.sin
        arr[v * 3 + 1] = panel.y + p[0] * panel.sin + p[1] * panel.cos
        arr[v * 3 + 2] = z
        fades[v] = fade
        v += 1
      }
    }
    position.needsUpdate = true
    fadeAttr.needsUpdate = true
  })

  return (
    <lineSegments geometry={geometry} frustumCulled={false} renderOrder={-8}>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  )
}
