import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import * as THREE from 'three'
import { ease, pointer } from './pointer'
import { DEFAULT_MOOD, createRoom, sampleMood } from './mood'
import type { Mood, Room } from './mood'

/**
 * The object in front of the wall.
 *
 * Two shapes, one material recipe and one behaviour, so a project can put its
 * own mark in front of the screens instead of ours:
 *
 * - `gem` — the cut stone (`OctahedronGeometry`, stretched point to point);
 * - `monogram` — a letter built out of bars (an N is three), which is how a
 *   logo mark is usually sculpted.
 *
 * Both are *liquid glass*: real transmission with a wide dispersion, a bright
 * fresnel rim, an iridescent edge — and they answer the cursor. Passing over
 * the object is enough: it turns towards the pointer, and the patch of surface
 * facing it is pulled out, so the block behaves like a drop rather than a pane.
 */

export type EmblemShape = 'gem' | 'monogram'

export type EmblemProps = {
  shape?: EmblemShape
  /** overall size, in world units */
  size?: number
  /** how hard the cursor pulls the surface */
  pull?: number
  /** how much the object answers the cursor's position */
  follow?: number
  /** where the object stands, in world units (0 = the camera's own line of sight) */
  lift?: number
  /** the room's colour cycle: pass the host's own, or keep ours */
  mood?: Mood
}

/** how far the surface travels when it ripples, in world units */
const RIPPLE = 0.12

const RIM_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const RIM_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vNormal;
  varying vec3 vView;
  uniform vec3  uColor;
  uniform vec3  uEdge;
  uniform vec3  uEdgeCool;
  uniform float uIntensity;
  void main() {
    float ndv = abs(dot(normalize(vNormal), normalize(vView)));
    float rim = pow(1.0 - ndv, 3.2);
    float side = clamp(0.5 + 0.6 * normalize(vNormal).x, 0.0, 1.0);
    vec3 tint = mix(uEdgeCool, uEdge, side);
    vec3 color = mix(uColor, tint, smoothstep(0.1, 1.0, rim));
    float a = rim * uIntensity;
    gl_FragColor = vec4(color * a, a);
  }
`

const warm = new THREE.Color('#ff4fd8')
const cool = new THREE.Color('#67e8f9')
const white = new THREE.Color('#ffffff')

/**
 * Three bars make a letter. Kept as its own function so the proportions of the
 * mark live in one place: stem width, waist height, and the slant of the
 * diagonal, which is what tells an N apart from an H.
 */
/**
 * The shipped mark is an N, sculpted from three bars — that is how a monogram
 * is usually built, and it is the shape this module was written for. Another
 * letter means another layout of bars here; nothing else in the module cares.
 */
function monogramGeometry(): THREE.BufferGeometry {
  const stem = 0.26
  const height = 1.7
  const width = 0.9
  const depth = 0.42
  const left = new THREE.BoxGeometry(stem, height, depth, 3, 10, 3)
  left.translate(-(width / 2 - stem / 2), 0, 0)
  const right = new THREE.BoxGeometry(stem, height, depth, 3, 10, 3)
  right.translate(width / 2 - stem / 2, 0, 0)

  const diagonal = new THREE.BoxGeometry(stem * 0.86, Math.hypot(width - stem, height) * 0.94, depth * 0.94, 3, 12, 3)
  diagonal.rotateZ(-Math.atan2(width - stem, height))

  const geometry = mergeGeometries([left, right, diagonal], false) ?? left
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function gemGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.OctahedronGeometry(0.95, 3)
  geometry.scale(1.0, 1.34, 1.06)
  geometry.computeVertexNormals()
  return geometry
}

/** a small rig of lit planes, baked into a cube map — the colour glass picks up */
function useGels() {
  const gl = useThree((s) => s.gl)
  const [map, setMap] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    const target = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType })
    const camera = new THREE.CubeCamera(0.3, 40, target)
    const stage = new THREE.Scene()
    const plane = new THREE.PlaneGeometry(1, 1)
    const disposables: Array<THREE.Material | THREE.BufferGeometry> = [plane]
    const gels: Array<[string, number, [number, number, number], [number, number]]> = [
      ['#cfd4dc', 3.0, [-3.2, 1.6, 2.4], [7, 7]],
      ['#ffffff', 5.2, [0.8, 0.9, 4.4], [1.2, 1.2]],
      ['#b9c0cb', 2.0, [3.6, -1.1, 1.8], [5, 5]],
      ['#9aa2ad', 1.1, [-1.6, 3.0, -1.2], [2.2, 1.6]],
      ['#2b2d31', 0.7, [0, -3.6, 0], [9, 4]],
    ]
    gels.forEach(([color, intensity, position, scale]) => {
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color).multiplyScalar(intensity),
        side: THREE.DoubleSide,
        toneMapped: false,
      })
      disposables.push(material)
      const mesh = new THREE.Mesh(plane, material)
      mesh.position.set(...position)
      mesh.scale.set(scale[0], scale[1], 1)
      mesh.lookAt(0, 0, 0)
      stage.add(mesh)
    })
    camera.update(gl, stage)
    setMap(target.texture)
    return () => {
      setMap(null)
      target.dispose()
      disposables.forEach((item) => item.dispose())
    }
  }, [gl])

  return map
}

export default function Emblem({
  shape = 'gem',
  size = 1,
  pull = 0.13,
  follow = 1,
  lift = 0,
  mood = DEFAULT_MOOD,
}: EmblemProps) {
  const group = useRef<THREE.Group>(null)
  const hoverRef = useRef(0)
  const idleRef = useRef(0)
  const room = useMemo(() => createRoom(), [])
  const envMap = useGels()

  const geometry = useMemo(
    () => (shape === 'monogram' ? monogramGeometry() : gemGeometry()),
    [shape],
  )
  /** the object at rest: the ripple is always measured from this shape, never accumulated */
  const base = useMemo(() => Float32Array.from(geometry.attributes.position.array as Float32Array), [geometry])
  const normals = useMemo(() => Float32Array.from(geometry.attributes.normal.array as Float32Array), [geometry])

  const glass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        transmission: 1,
        thickness: 2.0,
        ior: 2.3,
        dispersion: 9,
        roughness: 0.03,
        metalness: 0,
        clearcoat: 0.4,
        clearcoatRoughness: 0.05,
        iridescence: 0.22,
        iridescenceIOR: 1.3,
        specularIntensity: 1,
        attenuationColor: new THREE.Color('#d9d9d9'),
        attenuationDistance: 3.2,
        color: new THREE.Color('#f6f6f6'),
        envMapIntensity: 1.6,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      }),
    [],
  )

  const rim = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#f2f2f2') },
      uEdge: { value: new THREE.Color('#fff4ec') },
      uEdgeCool: { value: new THREE.Color('#dde5f1') },
      uIntensity: { value: 0.9 },
    }),
    [],
  )

  useEffect(() => {
    glass.envMap = envMap
    glass.needsUpdate = true
  }, [envMap, glass])

  useEffect(
    () => () => {
      glass.dispose()
      geometry.dispose()
    },
    [glass, geometry],
  )

  useFrame((state, delta) => {
    const node = group.current
    if (!node) return
    idleRef.current += delta
    const idle = idleRef.current

    /* one slowly turning room relights the object, exactly as it relights the
       wall behind it — the two are never lit by different clocks */
    sampleMood(mood, idle, room)
    glass.attenuationColor.copy(room.line).lerp(white, 0.5)
    rim.uColor.value.copy(room.major)
    rim.uEdge.value.copy(room.line).lerp(warm, 0.42)
    rim.uEdgeCool.value.copy(room.line).lerp(cool, 0.42)

    /* the cursor: passing over the object turns it, and pulls the surface that
       faces the pointer out of the block */
    hoverRef.current = ease(hoverRef.current, pointer.inside ? 1 : 0, 2.6, delta)
    const hover = hoverRef.current
    const reach = Math.max(0, 1 - Math.hypot(pointer.x, pointer.y) / 1.15)
    const near = reach * reach * (3 - 2 * reach)
    const turn = follow * near

    node.rotation.x = ease(node.rotation.x, pointer.y * (0.08 + turn * 0.9) + Math.sin(idle * 0.26) * 0.05, 3.4, delta)
    node.rotation.y = ease(node.rotation.y, pointer.x * (0.2 + turn * 1.1) + idle * 0.06, 3.4, delta)
    node.rotation.z = Math.sin(idle * 0.19) * 0.04
    node.position.y = lift + Math.sin(idle * 0.55) * 0.05 + pointer.y * 0.05
    node.position.x = pointer.x * 0.12

    const position = geometry.attributes.position as THREE.BufferAttribute
    const array = position.array as Float32Array
    const hx = pointer.x * 0.78
    const hy = pointer.y * 0.62
    for (let i = 0; i < array.length; i += 3) {
      const bx = base[i]
      const by = base[i + 1]
      const bz = base[i + 2]
      const wave =
        (Math.sin(by * 3.1 + idle * 1.05) * 0.5 +
          Math.sin(bx * 4.2 - idle * 0.75) * 0.3 +
          Math.sin(bz * 3.6 + idle * 0.62) * 0.24) *
        RIPPLE
      let offset = wave
      if (hover > 0.002) {
        const dx = bx * 0.66 - hx
        const dy = by * 0.5 - hy
        offset += hover * pull * Math.exp(-(dx * dx + dy * dy) * 4.2)
      }
      array[i] = bx + normals[i] * offset
      array[i + 1] = by + normals[i + 1] * offset
      array[i + 2] = bz + normals[i + 2] * offset
    }
    position.needsUpdate = true
    geometry.computeVertexNormals()

    /* liquid glass: the cursor thickens the block, widens its dispersion and
       tightens its edge — a drop answers like that, a pane does not */
    glass.thickness = 2.0 + hover * 1.1
    glass.dispersion = 9 + hover * 6
    glass.iridescence = 0.22 + hover * 0.26
    glass.clearcoat = 0.4 + hover * 0.4
    glass.envMapIntensity = 1.6 + hover * 0.6
    rim.uIntensity.value = (0.85 + Math.sin(idle * 1.05) * 0.12 + hover * 0.5) * state.viewport.height / 5
  })

  return (
    <group ref={group} scale={size}>
      <mesh geometry={geometry} material={glass} renderOrder={0} />
      <mesh geometry={geometry} scale={1.006} renderOrder={2}>
        <shaderMaterial
          uniforms={rim}
          vertexShader={RIM_VERT}
          fragmentShader={RIM_FRAG}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <pointLight position={[0, 0.5, 2.6]} intensity={1.1} color="#f0f0f0" distance={14} decay={2} />
      <pointLight position={[-2.2, -1.2, 1.6]} intensity={0.5} color="#dfe4ea" distance={12} decay={2} />
    </group>
  )
}

export type { Room }
