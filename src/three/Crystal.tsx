import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { easing } from 'maath'
import * as THREE from 'three'
import { useAppStore } from '../store/useAppStore'
import { blendPalette, createPalette } from './palette'
import { pointer } from './pointer'

/** Additive fresnel shell: the neon edge of the prism. */
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
  uniform float uIntensity;

  void main() {
    float ndv = abs(dot(normalize(vNormal), normalize(vView)));
    float rim = pow(1.0 - ndv, 3.2);
    vec3 color = mix(uColor, uEdge, smoothstep(0.1, 1.0, rim));
    float a = rim * uIntensity;
    gl_FragColor = vec4(color * a, a);
  }
`

/**
 * The refractive centrepiece of the reference: a *triangular glass prism*
 * standing in front of the giant wordmark, turning slowly, its edges catching
 * the chromatic light of the room. It stays for the whole dive — it only thins
 * out when the page flips to the light blueprint sheet, where the room itself
 * becomes paper.
 */
export default function Crystal() {
  const viewport = useThree((s) => s.viewport)
  const groupRef = useRef<THREE.Group>(null)
  const idleRef = useRef(0)
  const publishRef = useRef(0)
  const presence = useRef(1)
  const palette = useMemo(() => createPalette(), [])
  const rimUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#cfe4ff') },
      uEdge: { value: new THREE.Color('#7c5cff') },
      uIntensity: { value: 0.9 },
    }),
    [],
  )
  const glowUniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#8f7bff') },
      uIntensity: { value: 0.5 },
    }),
    [],
  )
  const glowMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: glowUniforms,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          precision highp float;
          varying vec2 vUv;
          uniform vec3 uColor;
          uniform float uIntensity;
          void main() {
            float d = length(vUv - 0.5) * 2.0;
            float core = pow(max(0.0, 1.0 - d), 3.4);
            float halo = pow(max(0.0, 1.0 - d), 1.35) * 0.38;
            float a = (core + halo) * uIntensity;
            gl_FragColor = vec4(uColor * a, a);
          }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    [glowUniforms],
  )

  /**
   * A triangular prism — three square side facets and two triangular caps. It
   * is built along +Y then laid on its back so a large triangular face looks at
   * the camera, exactly like the glass object of the reference.
   */
  const body = useMemo(() => {
    const geometry = new THREE.CylinderGeometry(1.06, 1.06, 1.5, 3, 1, false)
    geometry.rotateX(-Math.PI / 2)
    geometry.scale(1.16, 1.0, 1.0)
    geometry.computeVertexNormals()
    return geometry
  }, [])
  const edges = useMemo(() => new THREE.EdgesGeometry(body, 12), [body])

  useEffect(
    () => () => {
      body.dispose()
      edges.dispose()
      glowMaterial.dispose()
    },
    [body, edges, glowMaterial],
  )

  useFrame((state, delta) => {
    const group = groupRef.current
    if (!group) return

    const store = useAppStore.getState()
    const [rx, ry, rz] = store.viewRotation
    const hero = store.scroll.heroProgress
    blendPalette(store.env, palette)
    const sheet = palette.sheet
    const travel = store.env.travel

    idleRef.current += delta
    const idle = idleRef.current
    const float = Math.sin(idle * 0.55) * 0.06

    /* the glass fades out on the light sheet and comes straight back after it */
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

    /* the prism grows through the pin, then settles; it is sized off the
       viewport so the triangle keeps the reference's footprint (≈ two thirds
       of the height) on any screen */
    const fit = Math.min(1.35, Math.max(0.42, viewport.height / 5.6))
    const grow = 1 + hero * 0.1 - travel * 0.42
    group.scale.setScalar(fit * grow * (0.55 + visible * 0.45))

    glowUniforms.uIntensity.value = (0.13 + Math.sin(idle * 1.3) * 0.03) * visible
    rimUniforms.uIntensity.value = (0.45 + Math.sin(idle * 1.05) * 0.08) * visible

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
      {/* the glass body — real transmission, so the wall's lettering and grid
          are refracted inside it */}
      <mesh>
        <primitive object={body} attach="geometry" />
        <meshPhysicalMaterial
          transmission={1}
          thickness={1.2}
          ior={1.9}
          dispersion={5.2}
          roughness={0.02}
          metalness={0}
          clearcoat={0}
          clearcoatRoughness={0.04}
          iridescence={0.22}
          iridescenceIOR={1.35}
          specularIntensity={1}
          attenuationColor="#d7e0ff"
          attenuationDistance={11}
          color="#fbfcff"
          envMapIntensity={0.35}
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* bright rim: the two faces of the prism catching the room's light */}
      <mesh scale={1.006}>
        <primitive object={body} attach="geometry" />
        <shaderMaterial
          uniforms={rimUniforms}
          vertexShader={RIM_VERT}
          fragmentShader={RIM_FRAG}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      <lineSegments scale={1.002}>
        <primitive object={edges} attach="geometry" />
        <lineBasicMaterial
          color="#eef3ff"
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {/* the halo the glass throws on the wall behind it */}
      <mesh position={[0, 0, -1.4]} scale={[2.9, 2.6, 1]} renderOrder={-1}>
        <planeGeometry args={[1, 1]} />
        <primitive object={glowMaterial} attach="material" />
      </mesh>

      {/* a studio of light cards — no external HDRI, no network */}
      <Environment resolution={256} frames={1} background={false}>
        <Lightformer form="rect" intensity={0.55} color="#9fb0ff" position={[-3.2, 1.6, 2.4]} scale={[6, 6, 1]} />
        <Lightformer form="rect" intensity={0.45} color="#7f95ff" position={[3.6, -1.1, 1.8]} scale={[4, 4, 1]} />
        <Lightformer form="circle" intensity={2.6} color="#ffffff" position={[0.8, 0.6, 4.6]} scale={[0.4, 0.4, 1]} />
        <Lightformer form="circle" intensity={2.2} color="#cfe9ff" position={[-4.2, 2.6, 2]} scale={[0.5, 0.5, 1]} />
        <Lightformer form="circle" intensity={1.8} color="#f0b6ff" position={[4.4, -2.4, 1.4]} scale={[0.45, 0.45, 1]} />
        <Lightformer form="rect" intensity={0.25} color="#1d2358" position={[0, -3.4, 0]} scale={[8, 3, 1]} />
      </Environment>

      <pointLight position={[0, 0, 2.8]} intensity={0.7} color="#cdd8ff" distance={12} decay={2} />
    </group>
  )
}
