import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { easing } from 'maath'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { blendPalette, createPalette } from './palette'
import { createRoom, sampleRoom } from './mood'
import { pointer } from './pointer'

/**
 * The refractive centrepiece of the key visual: a *clear gem* — an octahedron,
 * two pyramids meeting at the waist — standing in front of the giant wordmark.
 * The stone belongs to the room's black-and-white grade, so it reads as silver
 * glass rather than as a coloured object; when the room drifts into its red
 * mood the facets take the light with it, one edge leading the other. That
 * disagreement between the two edges is what still reads as dispersion.
 *
 * The gem is lit by its own gel rig (see `useGelEnvironment`) rather than by a
 * textured environment: the rig *is* the colour of the object, and building it
 * by hand keeps the panels out of the canvas — they are what the glass
 * refracts, never something the visitor should see floating beside it.
 */

/* the stone's own inks — the room supplies the rest, every couple of seconds */
const INK_WHITE = new THREE.Color('#ffffff')
const PRISM_WARM = new THREE.Color('#ff4fd8')
const PRISM_COOL = new THREE.Color('#67e8f9')
const HOT_WHITE = new THREE.Color('#ffffff')

/** Additive fresnel shell: the neon edge of the stone. */
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
  uniform vec3 uColor;
  uniform vec3 uEdge;
  uniform vec3 uEdgeCool;
  uniform float uIntensity;

  void main() {
    float ndv = abs(dot(normalize(vNormal), normalize(vView)));
    float rim = pow(1.0 - ndv, 3.2);
    /* the two facets of the stone never catch the light the same way: one runs
       warm, the other cold — the split the eye reads as dispersion */
    float side = clamp(0.5 + 0.6 * normalize(vNormal).x, 0.0, 1.0);
    vec3 tint = mix(uEdgeCool, uEdge, side);
    vec3 color = mix(uColor, tint, smoothstep(0.1, 1.0, rim));
    float a = rim * uIntensity;
    gl_FragColor = vec4(color * a, a);
  }
`

/** The burning heart of the stone: procedural cells, additive. */
const CORE_VERT = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const CORE_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vView;
  uniform vec3 uWarm;
  uniform vec3 uCool;
  uniform float uIntensity;
  uniform float uTime;

  vec3 hash3(vec3 p) {
    p = vec3(
      dot(p, vec3(127.1, 311.7, 74.7)),
      dot(p, vec3(269.5, 183.3, 246.1)),
      dot(p, vec3(113.5, 271.9, 124.6))
    );
    return fract(sin(p) * 43758.5453123);
  }

  /* distance to the nearest cell centre — the veins of the geode */
  float voronoi(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    float d = 8.0;
    for (int i = -1; i <= 1; i += 1) {
      for (int j = -1; j <= 1; j += 1) {
        for (int k = -1; k <= 1; k += 1) {
          vec3 g = vec3(float(i), float(j), float(k));
          vec3 o = hash3(p + g);
          d = min(d, length(g + o - f));
        }
      }
    }
    return d;
  }

  void main() {
    vec3 p = vPos * 6.4 + vec3(0.0, uTime * 0.05, 0.0);
    float cells = voronoi(p);
    float veins = smoothstep(0.0, 0.24, cells) * (1.0 - smoothstep(0.24, 0.58, cells));
    float ndv = abs(dot(normalize(vNormal), normalize(vView)));
    float edge = pow(1.0 - ndv, 2.2);
    vec3 colour = mix(uWarm, uCool, smoothstep(0.1, 0.9, veins + edge * 0.6));
    float a = (veins * 0.4 + edge * 0.35) * uIntensity;
    gl_FragColor = vec4(colour * a, a);
  }
`

const GLOW_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const GLOW_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uIntensity;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float core = pow(max(0.0, 1.0 - d), 3.4);
    float halo = pow(max(0.0, 1.0 - d), 1.55) * 0.3;
    float a = (core + halo) * uIntensity;
    gl_FragColor = vec4(uColor * a, a);
  }
`

/**
 * The white mass the reference puts *inside* the glass.
 *
 * It is not a highlight on the surface: it is a broad, torn, painted stroke
 * burning behind the stone, which the transmission then refracts — that is why
 * it reads as light trapped in the block rather than as a sticker on it. The
 * torn edge comes from five octaves of value noise crossed with an ellipse,
 * so the silhouette is never twice the same and never a clean blob.
 */
const MASS_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const MASS_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uIntensity;
  uniform float uTime;
  uniform float uSeed;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + 11.7;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    /* a stroke wider than it is tall, sitting just under the stone's waist */
    float d = length((p - vec2(0.0, 0.05)) * vec2(0.74, 1.16));
    float body = 1.0 - smoothstep(0.2, 1.0, d);
    float torn = fbm(p * 3.1 + uSeed + vec2(uTime * 0.02, uTime * -0.014));
    float mask = smoothstep(0.34, 0.74, body * 0.94 + torn * 0.42);
    float hot = pow(max(0.0, body), 2.2);
    vec3 colour = mix(uColor, uHot, 0.28 + hot * 0.72);
    float a = mask * (0.4 + hot * 0.6) * uIntensity;
    gl_FragColor = vec4(colour * a, a);
  }
`

/**
 * The liquid inside the stone.
 *
 * The reference glass is not a clean block: its inner surface is a slow,
 * torn marbling that drifts across the facets, so the object reads as
 * something poured rather than cut. This layer sits a hair outside the glass
 * body (so it shares the body's own ripple) and paints that marbling: a stack
 * of drifting bands, warped by low-frequency noise and chewed at the edges by
 * a second, faster one.
 */
const LIQUID_VERT = /* glsl */ `
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vPos = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const LIQUID_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vPos;
  varying vec3 vNormal;
  varying vec3 vView;
  uniform vec3  uColor;
  uniform vec3  uHot;
  uniform float uIntensity;
  uniform float uTime;

  float hash(vec3 p) {
    p = vec3(
      dot(p, vec3(127.1, 311.7, 74.7)),
      dot(p, vec3(269.5, 183.3, 246.1)),
      dot(p, vec3(113.5, 271.9, 124.6))
    );
    return fract(sin(p) * 43758.5453123).x;
  }

  float vnoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i);
    float n100 = hash(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
      mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
      u.z
    );
  }

  void main() {
    /* the waterline: bands running across the stone, warped by its own shape */
    float y = vPos.y * 3.6 + uTime * 0.55;
    float warp = sin(vPos.x * 4.6 - uTime * 0.7) * 1.5 + vnoise(vPos * 3.2 + uTime * 0.07) * 2.4;
    float band = sin(y + warp) * 0.5 + 0.5;
    band = smoothstep(0.34, 0.94, band);
    /* the band is chewed at its edge: poured, not drawn */
    float torn = vnoise(vPos * 7.5 - vec3(0.0, uTime * 0.18, uTime * 0.05));
    band *= smoothstep(0.3, 0.66, torn + 0.32);

    float ndv = abs(dot(normalize(vNormal), normalize(vView)));
    float edge = pow(1.0 - ndv, 1.5);
    vec3 colour = mix(uColor, uHot, 0.3 + band * 0.55);
    float a = band * (0.3 + edge * 0.7) * uIntensity;
    gl_FragColor = vec4(colour * a, a);
  }
`

/** how far the surface of the stone travels when it ripples, in world units */
const RIPPLE = 0.075

/**
 * The wave the stone's surface runs on: three slow swells travelling in
 * different directions, sampled on the *rest* shape of the gem so the motion
 * never accumulates. It is a wave, not a noise field — the eye should read
 * liquid, not static.
 */
function ripple(x: number, y: number, z: number, t: number) {
  return (
    (Math.sin(y * 3.1 + t * 1.05) * 0.5 +
      Math.sin(x * 4.2 - t * 0.75) * 0.3 +
      Math.sin(z * 3.6 + t * 0.62) * 0.24) *
    RIPPLE
  )
}

/** subdivisions per octahedron face: enough vertices for a wave, no more */
const GEM_SUBDIV = 6

/**
 * The stone's body: an octahedron — two pyramids meeting at the waist — cut
 * into a grid so it can *ripple*.
 *
 * Subdividing an octahedron the usual way would round it into a ball (the
 * polyhedron is projected onto its circumsphere), which would cost the stone
 * its diamond silhouette. So the faces are tessellated by hand and kept on
 * their own planes: the cut of the gem survives, and every face becomes a
 * sheet with enough vertices to carry a wave.
 */
function buildGem() {
  const corners = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ].map((p) => p.multiply(new THREE.Vector3(1.02, 1.02 * 1.34, 1.02 * 1.06)))

  const faces: Array<[number, number, number]> = [
    [0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2],
    [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5],
  ]

  const positions: number[] = []
  const normals: number[] = []
  const n = GEM_SUBDIV
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  const normal = new THREE.Vector3()
  const point = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, i: number, j: number) =>
    new THREE.Vector3()
      .copy(a)
      .addScaledVector(ab.copy(b).sub(a), i / n)
      .addScaledVector(ac.copy(c).sub(a), j / n)

  for (const [ia, ib, ic] of faces) {
    const a = corners[ia]
    const b = corners[ib]
    const c = corners[ic]
    normal.copy(b).sub(a).cross(ac.copy(c).sub(a)).normalize()
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n - i; j += 1) {
        const p00 = point(a, b, c, i, j)
        const p10 = point(a, b, c, i + 1, j)
        const p01 = point(a, b, c, i, j + 1)
        positions.push(p00.x, p00.y, p00.z, p10.x, p10.y, p10.z, p01.x, p01.y, p01.z)
        for (let k = 0; k < 3; k += 1) normals.push(normal.x, normal.y, normal.z)
        if (i + j < n - 1) {
          const p11 = point(a, b, c, i + 1, j + 1)
          positions.push(p10.x, p10.y, p10.z, p11.x, p11.y, p11.z, p01.x, p01.y, p01.z)
          for (let k = 0; k < 3; k += 1) normals.push(normal.x, normal.y, normal.z)
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry()
  const position = new THREE.Float32BufferAttribute(positions, 3)
  geometry.setAttribute('position', position)
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.computeBoundingSphere()

  return {
    geometry,
    attribute: position as THREE.BufferAttribute,
    /** the stone at rest, so the wave is always evaluated from the same shape */
    base: new Float32Array(positions),
    /** the face each vertex belongs to: the wave travels along it */
    face: new Float32Array(normals),
  }
}

/**
 * The gem's own lighting: a handful of gels arranged around the stone, baked
 * once into a cube map. This is the colour the glass picks up, so the rig is
 * written in greys — a bright white key, two cool fills and one soft top —
 * which is what makes the object read as cut glass instead of as a coloured
 * blob. Its warmth is added per frame by the room's mood, not baked in.
 */
function useGelEnvironment() {
  const gl = useThree((s) => s.gl)
  const [map, setMap] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    const target = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType })
    const camera = new THREE.CubeCamera(0.3, 60, target)
    const stage = new THREE.Scene()

    const gels: Array<[string, number, [number, number, number], [number, number]]> = [
      ['#cfd4dc', 3.0, [-3.2, 1.6, 2.4], [7, 7]],
      ['#b9c0cb', 2.2, [3.6, -1.1, 1.8], [5, 5]],
      ['#ffffff', 5.6, [0.8, 0.9, 4.4], [1.1, 1.1]],
      ['#eaeff6', 3.0, [4.2, 1.4, 1.2], [2.0, 2.4]],
      ['#d6dbe3', 2.2, [-3.4, -1.6, 1.6], [1.8, 2.2]],
      ['#9aa2ad', 1.3, [-1.6, 3.0, -1.2], [2.2, 1.6]],
      ['#2b2d31', 0.8, [0, -3.6, 0], [9, 4]],
    ]

    const disposables: Array<THREE.Material | THREE.BufferGeometry> = []
    const plane = new THREE.PlaneGeometry(1, 1)
    disposables.push(plane)
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

export default function Crystal() {
  const viewport = useThree((s) => s.viewport)
  const groupRef = useRef<THREE.Group>(null)
  const coreRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const massRef = useRef<THREE.Mesh>(null)
  const idleRef = useRef(0)
  const publishRef = useRef(0)
  const readyRef = useRef(false)
  const presence = useRef(1)
  /** scratch orientation for the two camera-facing planes (never cloned) */
  const billboard = useRef(new THREE.Quaternion())
  const palette = useMemo(() => createPalette(), [])
  const room = useMemo(() => createRoom(), [])
  const envMap = useGelEnvironment()

  const rimUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#f2f2f2') },
      uEdge: { value: new THREE.Color('#fff4ec') },
      uEdgeCool: { value: new THREE.Color('#dde5f1') },
      uIntensity: { value: 0.9 },
    }),
    [],
  )
  const glowUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#d8d8d8') },
      uIntensity: { value: 0.2 },
    }),
    [],
  )
  const coreUniforms = useMemo(
    () => ({
      uWarm: { value: new THREE.Color('#ffffff') },
      uCool: { value: new THREE.Color('#dfe6ff') },
      uIntensity: { value: 0.8 },
      uTime: { value: 0 },
    }),
    [],
  )
  const massUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#dfe6ff') },
      uHot: { value: new THREE.Color('#ffffff') },
      uIntensity: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: Math.random() * 24 },
    }),
    [],
  )

  const coreMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: coreUniforms,
        vertexShader: CORE_VERT,
        fragmentShader: CORE_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [coreUniforms],
  )
  const glowMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: glowUniforms,
        vertexShader: GLOW_VERT,
        fragmentShader: GLOW_FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    [glowUniforms],
  )
  const massMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: massUniforms,
        vertexShader: MASS_VERT,
        fragmentShader: MASS_FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    [massUniforms],
  )
  const liquidUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#dfe6ff') },
      uHot: { value: new THREE.Color('#ffffff') },
      uIntensity: { value: 0.5 },
      uTime: { value: 0 },
    }),
    [],
  )
  const liquidMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: liquidUniforms,
        vertexShader: LIQUID_VERT,
        fragmentShader: LIQUID_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [liquidUniforms],
  )
  const glassMaterial = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        transmission: 1,
        thickness: 2.2,
        ior: 2.4,
        dispersion: 9.5,
        roughness: 0.03,
        metalness: 0,
        clearcoat: 0.4,
        clearcoatRoughness: 0.05,
        iridescence: 0.18,
        iridescenceIOR: 1.3,
        specularIntensity: 1,
        attenuationColor: new THREE.Color('#d9d9d9'),
        attenuationDistance: 3.2,
        color: new THREE.Color('#f6f6f6'),
        envMapIntensity: 1.5,
        emissive: new THREE.Color('#171719'),
        emissiveIntensity: 0.35,
        transparent: true,
        opacity: 0.58,
        side: THREE.DoubleSide,
      }),
    [],
  )

  useEffect(() => {
    glassMaterial.envMap = envMap
    glassMaterial.needsUpdate = true
  }, [envMap, glassMaterial])

  useEffect(
    () => () => {
      glassMaterial.dispose()
      coreMaterial.dispose()
      glowMaterial.dispose()
      massMaterial.dispose()
      liquidMaterial.dispose()
    },
    [glassMaterial, coreMaterial, glowMaterial, massMaterial, liquidMaterial],
  )

  /**
   * The gem: an octahedron stretched along its point-to-point axis so it reads
   * as a cut stone rather than a die, and slightly deeper than it is wide so the
   * refraction has a body to travel through. It is tessellated (see `buildGem`)
   * so its surface can run — the stone is glass, and glass in the reference is
   * never still.
   */
  const gem = useMemo(() => buildGem(), [])
  const body = gem.geometry
  const edges = useMemo(() => new THREE.EdgesGeometry(body, 12), [body])
  /** the core is a smaller, subdivided octahedron so its cells stay inside */
  const core = useMemo(() => {
    const geometry = new THREE.OctahedronGeometry(0.62, 1)
    geometry.scale(1.0, 1.34, 1.06)
    return geometry
  }, [])

  useEffect(
    () => () => {
      gem.geometry.dispose()
      edges.dispose()
      core.dispose()
    },
    [gem, edges, core],
  )

  useFrame((state, delta) => {
    const group = groupRef.current
    if (!group) return

    /* the intro overlay must not lift before the stone has actually painted */
    if (!readyRef.current) {
      readyRef.current = true
      useAppStore.getState().setFrontReady(true)
    }

    const store = useAppStore.getState()
    const [rx, ry, rz] = store.viewRotation
    const hero = store.scroll.heroProgress
    blendPalette(store.env, palette)
    const sheet = palette.sheet
    const travel = store.env.travel

    idleRef.current += delta
    const idle = idleRef.current
    const float = Math.sin(idle * 0.55) * 0.06

    /* the stone thins out on the light sheet and comes straight back after it */
    const targetPresence = Math.max(0, Math.min(1, 1 - sheet * 1.35))
    presence.current += (targetPresence - presence.current) * Math.min(1, delta * 1.8)
    const visible = presence.current
    group.visible = visible > 0.01

    easing.dampE(
      group.rotation,
      [
        rx * 0.45 + pointer.y * 0.1 + Math.sin(idle * 0.26) * 0.045,
        ry * 0.75 + pointer.x * 0.24 + idle * 0.045,
        rz * 0.6 + Math.sin(idle * 0.19) * 0.04,
      ],
      0.32,
      delta,
    )
    group.position.set(
      pointer.x * 0.18,
      float + pointer.y * 0.08 + (0.5 - 0.52) * viewport.height,
      0.2 + Math.sin(idle * 0.4) * 0.05,
    )

    /* The stone is small at rest and grows through the pin, then settles back
       as the camera dives away from it — it is the subject of the key visual,
       not a permanent ornament. */
    const fit = Math.min(1.35, Math.max(0.42, viewport.height / 5.6))
    const grow = 0.86 + hero * 0.34 - travel * 0.34
    group.scale.setScalar(fit * grow * (0.55 + visible * 0.45))

    /* the heart of the stone turns against the glass and picks up more of the
       room's colour the further the camera has dived */
    const coreMesh = coreRef.current
    if (coreMesh) {
      coreMesh.rotation.y = -idle * 0.16
      coreMesh.rotation.z = idle * 0.05
    }

    /* The liquid: every facet of the stone ripples along its own normal, so
       the cut of the diamond survives while its surface runs like water. The
       wave is always measured from the rest shape, never accumulated. */
    const attr = gem.attribute
    const positions = attr.array as Float32Array
    for (let i = 0; i < positions.length; i += 3) {
      const bx = gem.base[i]
      const by = gem.base[i + 1]
      const bz = gem.base[i + 2]
      const wave = ripple(bx, by, bz, idle)
      positions[i] = bx + gem.face[i] * wave
      positions[i + 1] = by + gem.face[i + 1] * wave
      positions[i + 2] = bz + gem.face[i + 2] * wave
    }
    attr.needsUpdate = true
    body.computeVertexNormals()
    coreUniforms.uTime.value = idle
    coreUniforms.uIntensity.value = (0.5 + hero * 0.2 + travel * 0.18 + Math.sin(idle * 0.9) * 0.05) * visible

    /* The stone is lit by the room, and the room changes colour every couple of
       seconds — so the glass, its rim, its heart and the stroke behind it all
       turn together. The two rim edges never agree (one is pulled warm, the
       other cool) which is what keeps a prismatic fringe on a stone that is
       otherwise following the room exactly. */
    sampleRoom(idle, room)
    rimUniforms.uColor.value.copy(room.major)
    rimUniforms.uEdge.value.copy(room.line).lerp(PRISM_WARM, 0.42)
    rimUniforms.uEdgeCool.value.copy(room.line).lerp(PRISM_COOL, 0.42)
    rimUniforms.uIntensity.value = (0.95 + Math.sin(idle * 1.05) * 0.12) * visible

    /* The halo only exists once the dive has started: at rest the stone sits
       naked on the wordmark, and it is the scroll that lights the room around
       it and lets the glow spread. */
    const halo = Math.max(0, Math.min(1, (hero - 0.06) / 0.5))
    glowUniforms.uColor.value.copy(room.glow)
    glowUniforms.uIntensity.value = (0.03 + halo * 0.34 + Math.sin(idle * 1.3) * 0.02 * halo) * visible

    /* the heart is white whatever the room is doing: the reference's stone
       burns, and the colour it burns *in* is the room's */
    coreUniforms.uWarm.value.copy(INK_WHITE)
    coreUniforms.uCool.value.copy(room.line)
    glassMaterial.attenuationColor.copy(room.line).lerp(INK_WHITE, 0.5)

    /* the painted stroke sits behind the glass, and faces the camera: it is a
       billboard, so the stone can keep turning inside a light that does not */
    massUniforms.uTime.value = idle
    massUniforms.uColor.value.copy(room.line).lerp(INK_WHITE, 0.5)
    massUniforms.uIntensity.value = (0.7 + hero * 0.35) * (0.35 + visible * 0.65)
    liquidUniforms.uTime.value = idle
    liquidUniforms.uColor.value.copy(room.line)
    liquidUniforms.uIntensity.value = (0.42 + hero * 0.18) * (0.3 + visible * 0.7)
    const face = billboard.current.copy(group.quaternion).invert().multiply(state.camera.quaternion)
    if (massRef.current) massRef.current.quaternion.copy(face)
    if (glowRef.current) glowRef.current.quaternion.copy(face)
    const glowMesh = glowRef.current
    if (glowMesh) {
      const spread = (1.5 + halo * 1.5) * (0.55 + visible * 0.45)
      glowMesh.scale.set(spread * 1.05, spread, 1)
    }

    /* publish the realtime 3D read-out at max 20fps (never per frame) */
    publishRef.current += delta
    if (publishRef.current > 0.05) {
      publishRef.current = 0
      const e = group.rotation
      store.setCoords({
        x: Math.sin(e.y) * 0.9,
        y: Math.sin(e.x) * -0.75,
        z: Math.cos(e.y) * 0.5,
        w: 1,
      })
    }
  })

  return (
    <group ref={groupRef}>
      {/* the glass body — real transmission with a wide dispersion, so the white
          letters behind it break into magenta on one facet and cyan on the next */}
      <mesh geometry={body} material={glassMaterial} renderOrder={0} />

      {/* the marbling running inside the block, one hair outside the glass so
          it shares the surface's own ripple */}
      <mesh geometry={body} scale={1.004} renderOrder={1} material={liquidMaterial} />

      {/* the burning core, drawn through the glass */}
      <mesh ref={coreRef} geometry={core} material={coreMaterial} renderOrder={-1} />

      {/* bright rim: the facets catching the room's light */}
      <mesh geometry={body} scale={1.006} renderOrder={2}>
        <shaderMaterial
          uniforms={rimUniforms}
          vertexShader={RIM_VERT}
          fragmentShader={RIM_FRAG}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <lineSegments geometry={edges} scale={1.002} renderOrder={3}>
        <lineBasicMaterial
          color="#f6eaff"
          transparent
          opacity={0.55}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {/* The white mass the reference traps inside the block: a torn, painted
          stroke burning behind the glass, which the transmission then refracts. */}
      <mesh ref={massRef} position={[0, 0.05, -0.92]} renderOrder={-2} material={massMaterial}>
        <planeGeometry args={[2.1, 1.6]} />
      </mesh>

      {/* the light the glass throws on the wall behind it — driven by the dive */}
      <mesh ref={glowRef} position={[0, 0, -1.4]} renderOrder={-1} material={glowMaterial}>
        <planeGeometry args={[1, 1]} />
      </mesh>

      <pointLight position={[0, 0.4, 2.8]} intensity={1.1} color="#f0f0f0" distance={14} decay={2} />
      <pointLight position={[-2.2, -1.2, 1.6]} intensity={0.5} color="#dfe4ea" distance={12} decay={2} />
      <pointLight position={[2.4, 1.4, 1.2]} intensity={0.6} color="#e6e6e6" distance={12} decay={2} />
    </group>
  )
}
