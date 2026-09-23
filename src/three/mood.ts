import * as THREE from 'three'

/**
 * The room changes colour.
 *
 * The page is one continuous room, and every `ROOM_STEP` seconds that room is
 * relit: violet-blue, black and white, violet and yellow, black and white
 * again, red, black and white — then back to the top. Every layer reads the
 * same sample (the wall, the wide light shafts, the glass, the drifting marks,
 * the wall lettering and the DOM scrim), so the whole page turns at once
 * instead of one element at a time.
 *
 * The change itself is a short crossfade rather than a cut: `ROOM_FADE` of the
 * step is spent dissolving the previous light into the next one, which is what
 * makes a colour arrive instead of a colour *switch*.
 */
export type Room = {
  /** the air the room dissolves into */
  base: THREE.Color
  /**
   * The mosaic panels themselves. This is the surface the visitor reads as
   * "the room", so it is the one that has to change colour: near-black in the
   * black-and-white room so the white rules and shafts stay the subject, deep
   * violet in the violet one so the whole wall is the colour.
   */
  panel: THREE.Color
  /** fine grid ink — the colour of the room's light */
  line: THREE.Color
  /** major rules and the wide shafts raking across the wall */
  major: THREE.Color
  /** ambient glow near the camera, behind the stone */
  glow: THREE.Color
}

/** seconds each colour holds before the next one takes over */
export const ROOM_STEP = 2
/** seconds the change itself takes */
const ROOM_FADE = 0.8

const room = (base: string, panel: string, line: string, major: string, glow: string): Room => ({
  base: new THREE.Color(base),
  panel: new THREE.Color(panel),
  line: new THREE.Color(line),
  major: new THREE.Color(major),
  glow: new THREE.Color(glow),
})

/** the reference's key visual: a black room, a white grid, white shafts */
const blackAndWhite = () => room('#050505', '#0d0d0d', '#d8d8d8', '#ffffff', '#8e8e8e')

/**
 * The cycle, in order. It opens on the violet-blue the reference key visual
 * lives in, and every colour is followed by the black-and-white room so the
 * page keeps coming back to its own grade instead of drifting into a rainbow.
 */
export const ROOMS: Room[] = [
  room('#0b0620', '#2b2f8f', '#8ea6ff', '#ffffff', '#5b3cff'),
  blackAndWhite(),
  room('#140a22', '#57400a', '#f4cf3f', '#fff6d0', '#7b4cff'),
  blackAndWhite(),
  room('#120405', '#6b1409', '#ff9d8c', '#fff0ec', '#ff3a1f'),
  blackAndWhite(),
]

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Samples the room at `time` (seconds, monotonic) into `out` — call it once
 * per frame with a scratch room, never allocate per frame.
 */
export function sampleRoom(time: number, out: Room): Room {
  const t = Math.max(0, time)
  const step = Math.floor(t / ROOM_STEP)
  const local = t - step * ROOM_STEP
  const k = smoothstep(0, ROOM_FADE, local)
  /* the very first step has nothing behind it: the page opens already lit */
  const from = step === 0 ? ROOMS[0] : ROOMS[(step - 1 + ROOMS.length) % ROOMS.length]
  const to = ROOMS[step % ROOMS.length]

  out.base.copy(from.base).lerp(to.base, k)
  out.panel.copy(from.panel).lerp(to.panel, k)
  out.line.copy(from.line).lerp(to.line, k)
  out.major.copy(from.major).lerp(to.major, k)
  out.glow.copy(from.glow).lerp(to.glow, k)
  return out
}

/** a mutable room for frame loops (never allocated per frame) */
export function createRoom(): Room {
  return {
    base: new THREE.Color(),
    panel: new THREE.Color(),
    line: new THREE.Color(),
    major: new THREE.Color(),
    glow: new THREE.Color(),
  }
}
