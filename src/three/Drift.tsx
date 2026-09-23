import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { pointer } from './pointer'

const vertexShader = /* glsl */ `
  attribute vec3  aOrigin;
  attribute vec3  aColor;
  attribute float aSeed;
  attribute float aScale;
  attribute float aRot;
  attribute float aSpeed;

  uniform float uTime;
  uniform float uCameraZ;

  varying vec3  vColor;
  varying float vFade;

  void main() {
    float t = uTime * aSpeed;

    vec3 local = position * aScale;
    float angle = aRot + t * 0.18;
    float c = cos(angle);
    float s = sin(angle);
    local = vec3(local.x * c - local.z * s, local.y, local.x * s + local.z * c);

    // drift toward the camera and wrap around endlessly — the wrap is anchored
    // on the camera so the triangles keep flowing past however deep the page
    // has dived
    float span = 26.0;
    float z = mod(aOrigin.z + t * 0.9 - uCameraZ + span * 0.5, span) - span * 0.5 + uCameraZ;
    vec3 world = vec3(aOrigin.x, aOrigin.y, z) + local;

    vec4 mv = modelViewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mv;

    float near = smoothstep(-2.5, -1.0, mv.z);
    float far = smoothstep(-26.0, -8.0, mv.z);
    vFade = near * (1.0 - far) * 0.9 + 0.1;
    vColor = aColor;
    vColor += vec3(0.12, 0.05, 0.2) * sin(uTime * 0.4 + aSeed * 6.2831);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec3  vColor;
  varying float vFade;

  void main() {
    gl_FragColor = vec4(vColor * (0.7 + vFade * 1.1), vFade * 0.6);
  }
`

const TRIANGLES = 22

/** Wireframe triangles drifting through the volume behind the wordmark. */
export default function Drift() {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const groupRef = useRef<THREE.Group>(null)

  const geometry = useMemo(() => {
    const corners = [0, 1, 2].map((i) => {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2
      return [Math.cos(a), Math.sin(a), 0] as const
    })
    // three edges = 6 vertices per triangle
    const edges = [
      [corners[0], corners[1]],
      [corners[1], corners[2]],
      [corners[2], corners[0]],
    ]

    const position: number[] = []
    const origin: number[] = []
    const color: number[] = []
    const seed: number[] = []
    const scale: number[] = []
    const rot: number[] = []
    const speed: number[] = []

    const orange = new THREE.Color('#ff6a1a')
    const violet = new THREE.Color('#a855f7')
    const cyan = new THREE.Color('#67e8f9')

    for (let i = 0; i < TRIANGLES; i += 1) {
      const r = Math.random()
      const tint = r < 0.62 ? orange : r < 0.88 ? violet : cyan
      const ox = (Math.random() - 0.5) * 16
      const oy = (Math.random() - 0.5) * 9
      const oz = (Math.random() - 0.5) * 26
      const s = 0.45 + Math.random() * 1.5
      const sr = Math.random() * Math.PI
      const sp = 0.16 + Math.random() * 0.5
      const sd = Math.random()

      for (const edge of edges) {
        for (const point of edge) {
          position.push(point[0], point[1], point[2])
          origin.push(ox, oy, oz)
          color.push(tint.r, tint.g, tint.b)
          seed.push(sd)
          scale.push(s)
          rot.push(sr)
          speed.push(sp)
        }
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3))
    geo.setAttribute('aOrigin', new THREE.Float32BufferAttribute(origin, 3))
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(color, 3))
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1))
    geo.setAttribute('aScale', new THREE.Float32BufferAttribute(scale, 1))
    geo.setAttribute('aRot', new THREE.Float32BufferAttribute(rot, 1))
    geo.setAttribute('aSpeed', new THREE.Float32BufferAttribute(speed, 1))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40)
    return geo
  }, [])

  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uCameraZ: { value: 0 } }), [])

  useFrame((state) => {
    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uCameraZ.value = state.camera.position.z
    const group = groupRef.current
    if (!group) return
    group.rotation.y = pointer.x * 0.06
    group.rotation.x = -pointer.y * 0.04
  })

  return (
    <group ref={groupRef}>
      <lineSegments geometry={geometry} frustumCulled={false}>
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
    </group>
  )
}
