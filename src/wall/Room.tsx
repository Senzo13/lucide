import { useCallback, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { pointer, ease } from './pointer'
import type { Feed } from './feed'
import { SCREEN_COLS, SCREEN_ROWS } from './feed'

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
  /* the visitor's cursor, in the frame's own coordinates (0 → 1, y up) */
  uniform vec2  uPointer;
  uniform float uHover;
  /* how much of the room's lattice lands on the ground and the ceiling. The
     key visual is a wall of screens and nothing else: under it there is no
     floor grid at all, and the cells only come back deeper in the document. */
  uniform float uGround;

  /* the wall's own broadcast moment: while uScreen is up, the cells of the
     *existing* grid behave as monitors and show what the CPU painted for them */
  uniform float uScreen;
  uniform float uCutSeed;
  uniform float uScreenCols;
  uniform float uScreenRows;
  uniform sampler2D uScreens;

  const float CEIL_Y = 6.4;

  float hash21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
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

    /* ---- the visitor's own distortion ----------------------------------
       The wall answers the cursor. Not with a ring and not with a round glow:
       the *geometry* of the room is displaced where the pointer is — a soft
       square patch, because the room is a grid and a grid bends squarely —
       and the picture on the screens is displaced with it, so the pixels
       really move instead of being tinted. */
    vec2 pdelta = (vUv - uPointer) * vec2(uAspect, 1.0);
    vec2 psq = pdelta * pdelta;
    float pnear = max(abs(pdelta.x), abs(pdelta.y));
    float lensField = uHover * exp(-pnear * pnear * 18.0);
    float lensRing = uHover * sin((psq.x + psq.y) * 42.0 - uTime * 2.8) * exp(-(psq.x + psq.y) * 11.0);
    /* the patch is also a lamp: the cursor wakes the screens it is over, just
       enough to read as attention and never enough to light the room */
    float lensLamp = lensField * 0.5;

  float structure = 0.0;   // fine grid, accumulated over the surfaces
  float majorMask = 0.0;   // amber rules
  float tiles = 0.0;       // mosaic panel shading (0.5 = neutral)
  float seams = 0.0;       // the joint between two mosaic panels
    float band = 0.0;        // wide diagonal light shafts
    float glow = 0.0;        // bleed right under the camera
    float near = 0.0;        // how close the visible structure is
    float crossings = 0.0;   // registration crosses (blueprint sheet only)
    float screenGap = 0.0;   // the black joint between two screens
    float screenJoint = 0.0; // ... as it lands on the wall itself
    float screenMask = 0.0;  // how much of this fragment is a lit monitor
    vec3  screenInk = vec3(0.0); // what that monitor is showing

    /* ---- floor --------------------------------------------------------- */
    if (rd.y < -0.0001) {
      float t = (uFloorY - ro.y) / rd.y;
      vec3 p = ro + rd * t;
      float fade = exp(-t * uFogK);
      float fine = gridMask(p.xz, uCell) * uGround;
      float maj = gridMask(p.xz, uMajorCell) * uGround;
      structure += fine * 0.5 * fade;
      majorMask += maj * 0.85 * fade;
      glow += exp(-length(p.xz - ro.xz) * 0.3) * fade * 0.85 * uGround;
      /* the floor is tiled with the same screens as the wall, so it takes the
         same black joint between them */
      vec2 fg = p.xz / uCell;
      float fgap = 0.5 - max(abs(fract(fg.x) - 0.5), abs(fract(fg.y) - 0.5));
      screenGap = max(screenGap, (1.0 - smoothstep(0.012, 0.052, fgap)) * fade * uGround);
      near = max(near, fade);
    }

    /* ---- ceiling (kept very faint: the room reads as open above) ------- */
    if (rd.y > 0.0001) {
      float t = (CEIL_Y - ro.y) / rd.y;
      vec3 p = ro + rd * t;
      float fade = exp(-t * uFogK * 1.5);
      structure += gridMask(p.xz, uCell) * 0.16 * fade * uGround;
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
        /* the cursor bends the wall itself: the arc length and the height of
           the surface under the pointer are pushed away from it, and a gentle
           ring travels out of the same patch — so the lattice, the joint
           between two screens and whatever they are showing all move on the
           same rubber */
        u += (pdelta.x * 0.17 + lensRing * 0.05) * lensField;
        v += (pdelta.y * 0.17 + lensRing * 0.05) * lensField;
        float fine = gridMask(vec2(u, v), uCell);
        float maj = gridMask(vec2(u * 0.5, v), uMajorCell);
        structure += fine * 0.42 * fade;
        majorMask += maj * 1.0 * fade;

        /* The wall is not one sheet: it is a mosaic of screens, and between two
           screens there is a black joint. Wide enough to read as a bezel at
           the front of the room, thin enough that the grid stays the subject —
           and it is what makes a lit cell read as a *screen* coming on, since
           its light stops at the joint instead of bleeding into its neighbour. */
        vec2 sc = floor(vec2(u, v) / uCell);
        vec2 sf = fract(vec2(u, v) / uCell);
        float joint = 0.5 - max(abs(sf.x - 0.5), abs(sf.y - 0.5));
        float jointMask = (1.0 - smoothstep(0.014, 0.055, joint)) * fade;
        screenJoint = max(screenJoint, jointMask);
        screenGap = max(screenGap, jointMask);

        /* mosaic: big dark panels, each lit a little differently, crossed by
           a soft diagonal sheen — the tiled wall of the key visual. The
           variation is deliberately shallow: the reference's wall is a flat
           dark sheet of squares, not a patchwork of different colours. */
        vec2 cell = floor(vec2(u / uTileW, v / uTileH));
        float h = hash21(cell);
        float sheen = sin((u * 0.16 + v * 0.42) + h * 6.2831);
        tiles += (h - 0.5) * 0.46 + sheen * 0.05 * (0.4 + h);

        /* the joint between two panels, so the mosaic reads as built rather
           than as a texture stretched over the wall */
        vec2 edge = abs(fract(vec2(u / uTileW, v / uTileH) + 0.5) - 0.5) * vec2(uTileW, uTileH);
        seams += (1.0 - clamp(min(edge.x, edge.y) / 0.075, 0.0, 1.0)) * fade;

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

        /* ---- the wall's broadcast moment --------------------------------
           Nothing is laid over the picture here. The *cells that are already
           on the wall* — the ones the visitor is looking at — go black, catch
           the room's own light, carry the studio's triangle, and write a word.
           Tying it to the distance fade keeps the far end of the room quiet,
           and every
           colour comes from the palette the room is already using. */
        if (uScreen > 0.002) {
          /* a band of the wall is the video wall; it shows one feed, painted
             on the CPU, and anything it is not showing stays transparent so
             the room underneath is left exactly as it was */
          float bandTop = floor(mix(-1.0, 3.0, hash11(uCutSeed)));
          float bandRow = sc.y - bandTop;
          float inBand = step(-0.5, bandRow) * (1.0 - step(uScreenRows - 0.5, bandRow));
          /* the picture slides a little *inside* its cell as well: the glass
             and the image on it do not bend by the same amount, and that
             difference is what makes the pixels read as liquid */
          vec2 inner = sf + pdelta * lensField * 0.24;
          vec2 shotUv = vec2(mod(sc.x, uScreenCols) + inner.x, bandRow + inner.y) / vec2(uScreenCols, uScreenRows);
          vec4 shot = texture2D(uScreens, shotUv);
          float cover = shot.a * inBand * clamp(fade * 1.7, 0.0, 1.0);
          screenInk = mix(screenInk, shot.rgb, cover);
          screenMask = max(screenMask, cover);
        }
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

    /* ---- the black joint between two screens --------------------------- */
    color *= 1.0 - clamp(screenGap, 0.0, 1.0) * 0.9;

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

    /* the light the cursor brings with it — the wall's own cells first, so the
       screens answer even when nothing is being broadcast */
    color += mix(uLine, vec3(1.0), 0.35) * lensLamp * 0.09;

    /* ---- the wall's broadcast moment ------------------------------------
       A lit monitor *replaces* the wall where it stands: its own dark glass,
       and whatever the feed is showing on it. Nothing else on the frame moves
       and no cell lights up unless the feed has something to put there. */
    if (uScreen > 0.002) {
      float lit = clamp(screenMask, 0.0, 1.0) * uScreen;
      color = mix(color, screenInk + lensLamp * 0.1, lit);
      /* the bezel cuts the picture too: a broadcast is still made of separate
         screens, and a joint that vanished inside a lit image would turn the
         wall into one flat panel */
      color *= 1.0 - clamp(screenJoint, 0.0, 1.0) * 0.92 * lit;
    }

    /* ---- scanlines (light on dark, dust on paper) ----------------------
       The glass, and only the glass: the band that used to travel down the
       frame every fourteen seconds is gone (see Scanlines.tsx). */
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

/** one frame of the room, handed to the driver */
export type RoomFrame = {
  camera: THREE.Camera
  size: { width: number; height: number }
  delta: number
  time: number
}

/**
 * What this project wants the room to be, this frame: where the camera stands,
 * what light the wall is under, what its screens are showing. It writes
 * straight into the material's own uniforms — the set is handed over, never
 * copied, because R3F deep-copies the object given to `<shaderMaterial>` and a
 * write to the copy would never reach the canvas.
 */
export type RoomDriver = (uniforms: Record<string, THREE.IUniform>, frame: RoomFrame) => void

export type WallRoomProps = {
  /** the picture the screens carry (see `feed.ts`) */
  feed: Feed
  /** the per-frame choreography */
  drive: RoomDriver
}

/**
 * The room itself: floor, ceiling and the curved wall that wraps around the
 * camera, ray-marched in one fullscreen pass. It owns nothing but the shader —
 * the camera, the light and the broadcast are all the driver's business, which
 * is what lets the same room be the site's journey and someone else's footer.
 */
export default function WallRoom({ feed, drive }: WallRoomProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  /** how strongly the wall answers the cursor right now (0 → 1, eased) */
  const hover = useRef(0)
  const driver = useRef(drive)
  driver.current = drive

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
      uGround: { value: 1 },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uHover: { value: 0 },
      uScreen: { value: 0 },
      uCutSeed: { value: 0 },
      uScreenCols: { value: feed.columns || SCREEN_COLS },
      uScreenRows: { value: feed.rows || SCREEN_ROWS },
      uScreens: { value: feed.texture },
    }),
    [feed],
  )

  useFrame((state, delta) => {
    const material = materialRef.current
    if (!material) return
    /* The material owns its uniforms: R3F deep-copies the object handed to
       <shaderMaterial>, so writing to the memoised one updates nothing at all
       — the canvas then sits frozen on its first frame. Every frame writes to
       the material's own set instead. */
    const u = material.uniforms

    pointer.x = ease(pointer.x, pointer.tx, 2.4, delta)
    pointer.y = ease(pointer.y, pointer.ty, 2.4, delta)
    u.uTime.value = state.clock.elapsedTime
    u.uAspect.value = state.size.width / Math.max(1, state.size.height)
    /* the wall answers the cursor: the pointer is published in the frame's own
       coordinates, and the strength fades in as the visitor moves — fluidly,
       and never harder than it needs to be on the light sheet, where a
       displaced lattice reads as a fault rather than as give */
    const sheet = u.uSheet.value as number
    hover.current = ease(hover.current, (pointer.inside ? 1 : 0) * (1 - sheet * 0.8), 3.2, delta)
    u.uPointer.value.set((pointer.x + 1) * 0.5, (pointer.y + 1) * 0.5)
    u.uHover.value = hover.current

    driver.current(u, {
      camera: state.camera,
      size: state.size,
      delta,
      time: state.clock.elapsedTime,
    })

    /* The camera is read *after* the driver has moved it: the room is a
       cylinder centred on the camera, so where that camera stands has to be
       this frame's position, not the last one's. */
    u.uInvProjection.value.copy(state.camera.projectionMatrixInverse)
    u.uCameraMatrix.value.copy(state.camera.matrixWorld)
    u.uCameraPos.value.copy(state.camera.position)
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
