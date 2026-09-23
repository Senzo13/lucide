import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { pointer, ease } from './pointer'
import { useAppStore } from '../store/useAppStore'
import { blendPalette, createPalette } from './palette'
import { createRoom, sampleRoom } from './mood'

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // fullscreen quad: ignore the camera, emit clip space directly
    gl_Position = vec4(position.xy, 0.999, 1.0);
  }
`

/**
 * The whole environment is one ray-marched room: a floor, a barely-there
 * ceiling and a *curved* wall that wraps around the camera. Because the wall is
 * a cylinder, its vertical rules converge on a single vanishing point and its
 * horizontal rules stay parallel — that is the stadium the reference dives
 * through. On the wall sits a mosaic of big dark panels crossed by wide light
 * streaks (the key visual's tiled black wall); deeper in the document the
 * panels fade and the fine pale grid takes over.
 *
 * `env` blends the whole thing continuously: black hall → electric hall →
 * light blueprint sheet → black technical grid → outro. Nothing cuts.
 */
const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform mat4  uInvProjection;
  uniform mat4  uCameraMatrix;
  uniform vec3  uCameraPos;
  uniform float uTime;
  uniform float uAspect;

  uniform vec3  uBase;
  uniform vec3  uLine;
  uniform vec3  uMajor;
  uniform vec3  uGlow;
  uniform float uCell;
  uniform float uMajorCell;
  uniform float uFogK;
  uniform float uLineGain;
  uniform float uMajorGain;
  uniform float uGlowGain;
  uniform float uTileW;
  uniform float uTileH;
  uniform float uTileGain;
  uniform vec3  uTile;
  uniform float uStreak;
  uniform float uSheet;
  uniform float uVignette;
  uniform float uRadius;
  uniform float uFloorY;
  uniform float uTravel;
  uniform float uHero;
  uniform float uWallOff;

  const float CEIL_Y = 6.4;

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  /* Anti-aliased distance (in cells) to the nearest grid line of either axis.
     The second factor is what keeps the wall dark: near the horizon a cell
     shrinks below one pixel, and a naive mask then reports "line" for every
     pixel in that band, fusing the whole grid into a grey haze. Fading the
     mask with the cell's own coverage makes the lines dissolve into their
     average ink instead — which is what the eye expects. */
  float gridMask(vec2 p, float cell) {
    vec2 c = p / cell;
    vec2 w = max(fwidth(c), vec2(1e-6));
    vec2 g = abs(fract(c - 0.5) - 0.5) / w;
    float line = 1.0 - clamp(min(g.x, g.y) / 1.15, 0.0, 1.0);
    float cover = clamp(1.0 / max(w.x, w.y), 0.0, 1.0);
    return line * cover;
  }

  vec3 rayDirection(vec2 uv) {
    vec4 clip = vec4(uv * 2.0 - 1.0, -1.0, 1.0);
    vec4 eye = uInvProjection * clip;
    vec3 dir = (uCameraMatrix * vec4(normalize(eye.xyz / eye.w), 0.0)).xyz;
    return normalize(dir);
  }

  void main() {
    vec3 ro = uCameraPos;
    vec3 rd = rayDirection(vUv);

  float structure = 0.0;   // fine grid, accumulated over the surfaces
  float majorMask = 0.0;   // amber rules
  float tiles = 0.0;       // mosaic panel shading (0.5 = neutral)
  float seams = 0.0;       // the joint between two mosaic panels
    float band = 0.0;        // wide diagonal light shafts
    float glow = 0.0;        // bleed right under the camera
    float near = 0.0;        // how close the visible structure is
    float crossings = 0.0;   // registration crosses (blueprint sheet only)

    /* ---- floor --------------------------------------------------------- */
    if (rd.y < -0.0001) {
      float t = (uFloorY - ro.y) / rd.y;
      vec3 p = ro + rd * t;
      float fade = exp(-t * uFogK);
      float fine = gridMask(p.xz, uCell);
      float maj = gridMask(p.xz, uMajorCell);
      structure += fine * 0.5 * fade;
      majorMask += maj * 0.85 * fade;
      glow += exp(-length(p.xz - ro.xz) * 0.3) * fade * 0.85;
      near = max(near, fade);
    }

    /* ---- ceiling (kept very faint: the room reads as open above) ------- */
    if (rd.y > 0.0001) {
      float t = (CEIL_Y - ro.y) / rd.y;
      vec3 p = ro + rd * t;
      float fade = exp(-t * uFogK * 1.5);
      structure += gridMask(p.xz, uCell) * 0.16 * fade;
      near = max(near, fade * 0.5);
    }

    /* ---- curved wall ----------------------------------------------------
       The cylinder is centred on the camera, so the wall always wraps around
       the view: its vertical rules converge on one vanishing point and its
       horizontal rules stay level — the reference's stadium. */
    float radial = length(rd.xz);
    if (radial > 1e-4) {
      {
        float t = uRadius / radial;
        vec3 p = ro + rd * t;
        float fade = exp(-t * uFogK * 0.85);
        /* arc length around the stadium: rules through the vanishing point */
        float ang = atan(p.x - ro.x, -(p.z - ro.z));
        float u = ang * uRadius + uWallOff;
        float v = p.y;
        float fine = gridMask(vec2(u, v), uCell);
        float maj = gridMask(vec2(u * 0.5, v), uMajorCell);
        structure += fine * 0.42 * fade;
        majorMask += maj * 1.0 * fade;

        /* mosaic: big dark panels, each lit a little differently, crossed by
           a soft diagonal sheen — the tiled wall of the key visual. The
           variation is deliberately shallow: the reference's wall is a flat
           dark sheet of squares, not a patchwork of different colours. */
        vec2 cell = floor(vec2(u / uTileW, v / uTileH));
        float h = hash21(cell);
        float sheen = sin((u * 0.16 + v * 0.42) + h * 6.2831);
        tiles += (h - 0.5) * 0.3 + sheen * 0.05 * (0.4 + h);

        /* the joint between two panels, so the mosaic reads as built rather
           than as a texture stretched over the wall */
        vec2 edge = abs(fract(vec2(u / uTileW, v / uTileH) + 0.5) - 0.5) * vec2(uTileW, uTileH);
        seams += (1.0 - clamp(min(edge.x, edge.y) / 0.055, 0.0, 1.0)) * fade;

        /* Light falling on the wall. The reference does not relight the room
           evenly: whole blocks of panels catch the light while their
           neighbours stay black, which is what makes the key visual read as
           patches of white on a black room rather than as a grey fog. The
           blocks are bound to the mosaic, so the light travels *with* the
           wall, and a slow crawl keeps the room alive while nothing moves. */
        vec2 bp = vec2(u / (uTileW * 1.5) + uTime * 0.012, v / (uTileH * 1.5) - uTime * 0.004);
        vec2 bf = fract(bp);
        float bh = hash21(floor(bp) + 4.3);
        float box = smoothstep(0.02, 0.24, bf.x) * (1.0 - smoothstep(0.76, 0.98, bf.x))
                  * smoothstep(0.02, 0.24, bf.y) * (1.0 - smoothstep(0.76, 0.98, bf.y));
        band += box * step(0.58, bh) * 1.5 * fade;

        /* one very slow wash travelling the length of the wall, so the light
           level never sits perfectly still */
        band += smoothstep(0.72, 1.0, sin(u * 0.9 + v * 1.6 - uTime * 0.05) * 0.5 + 0.5) * 0.18 * fade;

        glow += exp(-t * 0.06) * 0.22 * fade;
        near = max(near, fade);

        /* registration crosses on the blueprint sheet */
        vec2 q = abs(fract(vec2(u, v) / (uMajorCell * 4.0)) - 0.5) * (uMajorCell * 4.0);
        float cross = 1.0 - clamp(min(max(abs(q.x), abs(q.y) - 0.28), max(abs(q.y), abs(q.x) - 0.28)) / 0.045, 0.0, 1.0);
        crossings += cross * fade;
      }
    }

    /* the room's air ----------------------------------------------------- */
    vec3 color = uBase;
    /* The mosaic *is* the room: every panel is lit by the same light (uTile,
       which is the room's own colour) but never quite at the same level, and
       the joints between them stay dark. This is the surface that changes
       colour when the room is relit — not a wash laid over the whole frame. */
    float panel = clamp(1.0 - seams, 0.0, 1.0);
    color += uTile * panel * uTileGain * (0.62 + clamp(tiles, -0.5, 0.5) * 1.1);
    color *= 1.0 - clamp(tiles, -0.6, 0.6) * uTileGain * 0.35;
    color *= 1.0 - clamp(seams, 0.0, 1.0) * uTileGain * 0.95;

    color += uLine * clamp(structure, 0.0, 1.4) * uLineGain;
    color += uMajor * clamp(majorMask, 0.0, 1.4) * uMajorGain;
    /* the shafts are *light*, not a tint of the wall: the reference's key
       visual is carried by wide white beams raking across the black tiles.
       They are multiplied by the mosaic, so the light stays *on* the panels
       instead of dissolving the surface it is falling on. */
    color += mix(uLine, vec3(1.0), 0.55) * clamp(band, 0.0, 2.0) * uStreak * 0.26 * (0.3 + 0.7 * panel);
    color += uGlow * clamp(glow * 0.07, 0.0, 1.0) * uGlowGain;

    /* violet bloom sitting on the horizon, behind the prism */
    float horizon = exp(-pow((vUv.y - 0.47) * 6.2, 2.0));
    color += uGlow * horizon * 0.05 * uGlowGain;

    /* light "blueprint" sheet: the very same structure as ink on paper */
    vec3 paper = uBase;
    paper = mix(paper, vec3(0.055, 0.06, 0.20), clamp(structure * 1.25 * uLineGain, 0.0, 1.0));
    paper = mix(paper, uMajor, clamp(majorMask * 0.6 * uMajorGain, 0.0, 1.0));
    paper = mix(paper, vec3(0.09, 0.10, 0.26), clamp(crossings * 0.5, 0.0, 1.0));
    paper *= 1.0 - clamp(tiles, -0.6, 0.6) * 0.06;
    color = mix(color, paper, uSheet);

    /* ---- CRT sweep + scanlines (light on dark, dust on paper) ---------- */
    float sweep = fract(uTime * 0.021);
    color += uLine * exp(-pow((vUv.y - sweep) * 46.0, 2.0)) * 0.02 * (1.0 - uSheet);
    float scan = sin(vUv.y * 900.0) * 0.5 + 0.5;
    color *= 1.0 + (scan - 0.5) * 0.016 * (1.0 - uSheet * 0.7);

    color *= mix(0.92, 1.05, near);

    /* ---- vignette ------------------------------------------------------ */
    vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0);
    float vig = smoothstep(1.35, 0.25, length(d));
    color *= mix(mix(1.0, mix(0.34, 1.0, vig), uVignette), mix(1.0, mix(0.9, 1.0, vig), uVignette), uSheet);

    color *= 1.0 + uHero * 0.04;

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`

/** The room the camera travels through for the whole page. */
export default function Backdrop() {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const { camera, size } = useThree()
  const palette = useMemo(() => createPalette(), [])
  const room = useMemo(() => createRoom(), [])
  /** last time the room was published to CSS (the DOM wash rides the room) */
  const publishedAt = useRef(-1)

  const uniforms = useMemo(
    () => ({
      uInvProjection: { value: new THREE.Matrix4() },
      uCameraMatrix: { value: new THREE.Matrix4() },
      uCameraPos: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uBase: { value: new THREE.Color('#030304') },
      uLine: { value: new THREE.Color('#8d97c8') },
      uMajor: { value: new THREE.Color('#c8743a') },
      uGlow: { value: new THREE.Color('#4b3aa8') },
      uCell: { value: 0.62 },
      uMajorCell: { value: 4.96 },
      uFogK: { value: 0.03 },
      uLineGain: { value: 0.5 },
      uMajorGain: { value: 0.4 },
      uGlowGain: { value: 0.5 },
      uTileW: { value: 5.2 },
      uTileH: { value: 3.1 },
      uTileGain: { value: 0.5 },
      uTile: { value: new THREE.Color('#1b1b1b') },
      uStreak: { value: 1 },
      uSheet: { value: 0 },
      uVignette: { value: 1 },
      uRadius: { value: 7.6 },
      uFloorY: { value: -1.5 },
      uTravel: { value: 0 },
      uHero: { value: 0 },
      uWallOff: { value: 0 },
    }),
    [],
  )

  useFrame((state, delta) => {
    const material = materialRef.current
    if (!material) return

    pointer.x = ease(pointer.x, pointer.tx, 2.4, delta)
    pointer.y = ease(pointer.y, pointer.ty, 2.4, delta)

    const store = useAppStore.getState()
    const hero = store.scroll.heroProgress
    const { travel } = store.env
    blendPalette(store.env, palette)
    sampleRoom(state.clock.elapsedTime, room)
    /* The section ladder still owns the *structure* of the room (how fine the
       grid is, how far it dissolves, whether it is paper), but the colour is
       the room's: it turns every couple of seconds, everywhere at once. Paper
       keeps its own ink — a coloured wash over a light sheet reads as a stain. */
    const dark = 1 - palette.sheet

    /* The room travels with the camera: the cylinder is centred on it, so the
       wall always wraps around the view and the vanishing point stays put
       while the floor and the panels stream past below. */
    camera.position.x = pointer.x * 0.42
    camera.position.y = 0.55 + pointer.y * 0.16 - hero * 0.35 - travel * 0.5
    camera.position.z = 6 - travel * 26
    camera.rotation.z = pointer.x * 0.012 + Math.sin(state.clock.elapsedTime * 0.07) * 0.004

    uniforms.uInvProjection.value.copy(camera.projectionMatrixInverse)
    uniforms.uCameraMatrix.value.copy(camera.matrixWorld)
    uniforms.uCameraPos.value.copy(camera.position)
    uniforms.uTime.value = state.clock.elapsedTime
    uniforms.uAspect.value = size.width / Math.max(1, size.height)
    uniforms.uTravel.value = travel
    uniforms.uHero.value = hero
    uniforms.uWallOff.value = travel * 9

    uniforms.uBase.value.copy(palette.base).lerp(room.base, dark)
    uniforms.uLine.value.copy(palette.line).lerp(room.line, dark)
    uniforms.uMajor.value.copy(palette.major).lerp(room.major, dark)
    uniforms.uGlow.value.copy(palette.glow).lerp(room.glow, dark)
    uniforms.uCell.value = palette.cell
    uniforms.uMajorCell.value = palette.majorCell
    uniforms.uFogK.value = palette.fogK
    uniforms.uLineGain.value = palette.lineGain
    uniforms.uMajorGain.value = palette.majorGain
    uniforms.uGlowGain.value = palette.glowGain
    uniforms.uTileW.value = palette.tileW
    uniforms.uTileH.value = palette.tileH
    uniforms.uTileGain.value = palette.tileGain
    /* the panels take the room's light (dimmed), and keep their own ink on the
       light sheet where a coloured wash would read as a stain */
    uniforms.uTile.value.copy(palette.base).lerp(room.panel, dark)
    uniforms.uStreak.value = palette.streak
    uniforms.uSheet.value = palette.sheet
    uniforms.uVignette.value = palette.vignette
    uniforms.uRadius.value = palette.radius
    uniforms.uFloorY.value = palette.floorY
    /* The DOM scrim takes the room's light too: the page's own wash turns with
       the backdrop, so the whole frame changes colour and not just the canvas.
       Throttled to ~10 writes a second — during a crossfade that is enough for
       the naked eye, and it keeps the style engine out of the frame loop. */
    const now = state.clock.elapsedTime
    if (now - publishedAt.current > 0.09 || publishedAt.current < 0) {
      publishedAt.current = now
      const hex = room.line.getHex(THREE.SRGBColorSpace)
      const style = document.documentElement.style
      style.setProperty('--room-r', String((hex >> 16) & 255))
      style.setProperty('--room-g', String((hex >> 8) & 255))
      style.setProperty('--room-b', String(hex & 255))
      style.setProperty('--room-a', dark.toFixed(3))
    }
  })

  return (
    <mesh frustumCulled={false} renderOrder={-10}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  )
}
