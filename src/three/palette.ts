import * as THREE from 'three'
import type { EnvState, WorldMode } from '../store/useAppStore'

/**
 * One environment of the journey. The camera never cuts: the page blends the
 * world it is leaving into the world ahead, so the space deepens continuously
 * instead of stopping behind the hero.
 *
 * Every entry describes the same room — a floor, a ceiling and a *curved* wall
 * that wraps around the camera (the reference's stadium, whose grid converges
 * on a single vanishing point). What changes from world to world is the light:
 * the dark tiled hall of the key visual, the light blueprint sheet, the black
 * technical grid of the studio chapter.
 */
export type Palette = {
  /** the air the room dissolves into at depth */
  base: THREE.Color
  /** fine grid lines */
  line: THREE.Color
  /** major grid lines — the amber rules that give the stadium its structure */
  major: THREE.Color
  /** ambient glow near the camera / on the horizon */
  glow: THREE.Color
  /** fine grid cell, in world units */
  cell: number
  /** major grid cell, in world units */
  majorCell: number
  /** distance at which the room dissolves into `base` */
  fogK: number
  lineGain: number
  majorGain: number
  glowGain: number
  /** big mosaic panel size on the wall (width, height) */
  tileW: number
  tileH: number
  /** how strongly the mosaic panels read */
  tileGain: number
  /** sweeping diagonal light streaks across the wall */
  streak: number
  /** 0 = dark room, 1 = light "blueprint" sheet (ink on paper) */
  sheet: number
  /** how dark the frame edges are */
  vignette: number
  /** radius of the curved wall around the camera */
  radius: number
  /** height of the room's floor */
  floorY: number
  /** opacity of the giant ghost wordmark parked on the far wall */
  word: number
}

const make = (
  base: string,
  line: string,
  major: string,
  glow: string,
  cell: number,
  majorCell: number,
  fogK: number,
  lineGain: number,
  majorGain: number,
  glowGain: number,
  tileW: number,
  tileH: number,
  tileGain: number,
  streak: number,
  sheet: number,
  vignette: number,
  radius: number,
  floorY: number,
  word: number,
): Palette => ({
  base: new THREE.Color(base),
  line: new THREE.Color(line),
  major: new THREE.Color(major),
  glow: new THREE.Color(glow),
  cell,
  majorCell,
  fogK,
  lineGain,
  majorGain,
  glowGain,
  tileW,
  tileH,
  tileGain,
  streak,
  sheet,
  vignette,
  radius,
  floorY,
  word,
})

/**
 * Ordered from the hero to the footer — every section picks one. The values are
 * read off the reference screenshots: a black room whose wall is a mosaic of
 * big dark panels crossed by wide light streaks at the top, then the same room
 * with a much finer pale grid and amber rules, then paper, then the black
 * technical grid of the outro.
 */
export const PALETTES: Record<WorldMode, Palette> = {
  /** key visual: black mosaic wall, wide streaks, pale blue rules */
  space: make(
    '#030304', '#8d97c8', '#c8743a', '#4b3aa8',
    0.62, 4.96, 0.028, 0.36, 0.4, 0.34,
    5.2, 3.1, 0.44, 1.15, 0, 1, 7.6, -1.5, 0.05,
  ),
  /** news + projects: the camera sinks into the electric hall of the reference */
  hall: make(
    '#050510', '#9aa6d8', '#e08a3c', '#5b4bd0',
    0.44, 3.52, 0.05, 0.66, 0.76, 0.6,
    3.2, 1.9, 0.26, 0.5, 0, 1, 8.4, -1.5, 0.15,
  ),
  /** manifesto: the same room as a light blueprint sheet — ink on paper */
  blueprint: make(
    '#e8e6de', '#8f96b6', '#3c46c4', '#b9bede',
    0.34, 2.72, 0.05, 0.5, 0.8, 0.3,
    2.4, 1.5, 0.16, 0, 1, 0.22, 8.4, -1.5, 0.14,
  ),
  /** studio + contact: back to black, tight technical grid */
  grid: make(
    '#030307', '#7d89c8', '#c07a3c', '#4638a8',
    0.32, 2.56, 0.045, 0.55, 0.55, 0.5,
    2.4, 1.5, 0.16, 0.24, 0, 1, 8.8, -1.5, 0.11,
  ),
  /** outro: the room has almost dissolved */
  outro: make(
    '#010103', '#5a63a0', '#8a5a34', '#2b2270',
    0.36, 2.88, 0.06, 0.42, 0.4, 0.36,
    2.4, 1.5, 0.1, 0, 0, 1, 9.2, -1.5, 0.08,
  ),
}

/** scratch colours, reused so a frame never allocates */
const scratch = {
  base: new THREE.Color(),
  line: new THREE.Color(),
  major: new THREE.Color(),
  glow: new THREE.Color(),
}

const lerp = (x: number, y: number, t: number) => x + (y - x) * t

/**
 * Blends two environments by the mix published by `App.tsx`. Colours and
 * numbers are interpolated the same way, so grids, panels, streaks and light
 * sheet all evolve together — the world never cuts.
 */
export function blendPalette(env: EnvState, out: Palette) {
  const a = PALETTES[env.from] ?? PALETTES.space
  const b = PALETTES[env.to] ?? a
  const t = Math.min(1, Math.max(0, env.mix))

  scratch.base.copy(a.base).lerp(b.base, t)
  scratch.line.copy(a.line).lerp(b.line, t)
  scratch.major.copy(a.major).lerp(b.major, t)
  scratch.glow.copy(a.glow).lerp(b.glow, t)
  out.base.copy(scratch.base)
  out.line.copy(scratch.line)
  out.major.copy(scratch.major)
  out.glow.copy(scratch.glow)

  out.cell = lerp(a.cell, b.cell, t)
  out.majorCell = lerp(a.majorCell, b.majorCell, t)
  out.fogK = lerp(a.fogK, b.fogK, t)
  out.lineGain = lerp(a.lineGain, b.lineGain, t)
  out.majorGain = lerp(a.majorGain, b.majorGain, t)
  out.glowGain = lerp(a.glowGain, b.glowGain, t)
  out.tileW = lerp(a.tileW, b.tileW, t)
  out.tileH = lerp(a.tileH, b.tileH, t)
  out.tileGain = lerp(a.tileGain, b.tileGain, t)
  out.streak = lerp(a.streak, b.streak, t)
  out.sheet = lerp(a.sheet, b.sheet, t)
  out.vignette = lerp(a.vignette, b.vignette, t)
  out.radius = lerp(a.radius, b.radius, t)
  out.floorY = lerp(a.floorY, b.floorY, t)
  out.word = lerp(a.word, b.word, t)
  return out
}

/** a mutable palette instance for frame loops (never allocated per frame) */
export function createPalette(sheet = 0): Palette {
  return {
    base: new THREE.Color(),
    line: new THREE.Color('#8d97c8'),
    major: new THREE.Color('#c8743a'),
    glow: new THREE.Color('#4b3aa8'),
    cell: 0.5,
    majorCell: 4,
    fogK: 0.045,
    lineGain: 0.6,
    majorGain: 0.6,
    glowGain: 0.5,
    tileW: 4,
    tileH: 2.4,
    tileGain: 0.3,
    streak: 0.4,
    sheet,
    vignette: 1,
    radius: 8.4,
    floorY: -1.5,
    word: 0.12,
  }
}
