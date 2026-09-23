import { create } from 'zustand'

export type Vec3 = [number, number, number]

export type AudioDecision = 'pending' | 'on' | 'off'

/** live read-out of the realtime 3D view (top-right HUD) */
export type Coordinates = { x: number; y: number; z: number; w: number }

export type CursorVariant = 'default' | 'hover' | 'drag' | 'view' | 'text'

/** scroll metrics shared with the WebGL scene (read them non-reactively) */
export type ScrollMetrics = { y: number; progress: number; heroProgress: number }

/**
 * The world the WebGL layer is currently rendering. The reference site swaps
 * between radically different environments as you scroll (deep dark hall →
 * light blueprint sheet → black technical grid) — this is that switch.
 */
export type WorldMode = 'space' | 'hall' | 'blueprint' | 'grid' | 'outro'

/**
 * Continuous environment state: which two worlds the camera is currently
 * between, and how far it has travelled since the top of the document. Written
 * by `App.tsx` from the real section geometry, read non-reactively inside the
 * WebGL frame loop so the environment never cuts — it *drifts* from one world
 * into the next while the camera keeps sinking into the space.
 */
export type EnvState = {
  /** world left behind */ from: WorldMode
  /** world ahead */ to: WorldMode
  /** 0 → 1 blend between the two */ mix: number
  /** whole-document travel, 0 → 1 */ travel: number
  /** current viewport centre, in scroll pixels (drives the corridor) */
  center: number
}
export const DEFAULT_ENV: EnvState = {
  from: 'space',
  to: 'hall',
  mix: 0,
  travel: 0,
  center: 0,
}

/* Slightly off-axis, close to level: the mockup shows the prism almost facing
   the camera, with two large front facets. */
export const DEFAULT_ROTATION: Vec3 = [-0.16, 0.44, 0.06]
export const DEFAULT_COORDS: Coordinates = { x: -0.4, y: 0.0, z: 0.2, w: 1.0 }
export const DEFAULT_SCROLL: ScrollMetrics = { y: 0, progress: 0, heroProgress: 0 }

type AppState = {
  /** asset/preload progress 0 → 1 */
  progress: number
  /** first paint of the WebGL scene is done */
  sceneReady: boolean
  /** first painted frame of the foreground canvas (the gem) is done */
  frontReady: boolean
  /** intro overlay has been dismissed */
  loaded: boolean

  /** sound consent */
  audioDecision: AudioDecision
  audioEnabled: boolean
  audioLevels: number[]

  /** side menu */
  menuOpen: boolean

  /** custom cursor */
  cursorVariant: CursorVariant
  cursorLabel: string

  /** realtime view state shared DOM ⇄ WebGL */
  coords: Coordinates
  viewRotation: Vec3
  /** increments each time the user asks to reset the view */
  resetNonce: number
  /** increments when the scene should glitch */
  glitchNonce: number
  activeSection: string
  /** live scroll position — drives the scene choreography */
  scroll: ScrollMetrics
  /** live environment blend — drives the backdrop palette + camera travel */
  env: EnvState
  /** current environment of the WebGL world */
  worldMode: WorldMode
  /** section id that requested the current world mode (debug/QA) */
  worldModeSource: string

  setProgress: (n: number) => void
  setSceneReady: (v: boolean) => void
  setFrontReady: (v: boolean) => void
  setLoaded: (v: boolean) => void
  decideAudio: (v: Exclude<AudioDecision, 'pending'>) => void
  toggleAudio: () => void
  setAudioLevels: (levels: number[]) => void
  setMenuOpen: (v: boolean) => void
  setCursor: (variant: CursorVariant, label?: string) => void
  setCoords: (c: Coordinates) => void
  setViewRotation: (r: Vec3) => void
  resetView: () => void
  triggerGlitch: () => void
  setActiveSection: (id: string) => void
  setScroll: (metrics: ScrollMetrics) => void
  setEnv: (env: EnvState) => void
  setWorldMode: (mode: WorldMode, source?: string) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  progress: 0,
  sceneReady: false,
  frontReady: false,
  loaded: false,

  audioDecision: 'pending',
  audioEnabled: false,
  audioLevels: [0.2, 0.4, 0.3],

  menuOpen: false,

  cursorVariant: 'default',
  cursorLabel: '',

  coords: DEFAULT_COORDS,
  viewRotation: DEFAULT_ROTATION,
  resetNonce: 0,
  glitchNonce: 0,
  activeSection: 'top',
  scroll: DEFAULT_SCROLL,
  env: DEFAULT_ENV,
  worldMode: 'space',
  worldModeSource: 'app',

  setProgress: (n) => set({ progress: Math.min(1, Math.max(0, n)) }),
  setSceneReady: (v) => set({ sceneReady: v }),
  setFrontReady: (v) => set({ frontReady: v }),
  setLoaded: (v) => set({ loaded: v }),

  decideAudio: (v) => set({ audioDecision: v, audioEnabled: v === 'on' }),
  toggleAudio: () => {
    const { audioEnabled, audioDecision } = get()
    const next = !audioEnabled
    set({ audioEnabled: next, audioDecision: next ? 'on' : audioDecision === 'on' ? 'off' : audioDecision })
  },
  setAudioLevels: (levels) => set({ audioLevels: levels }),

  setMenuOpen: (v) => set({ menuOpen: v, cursorVariant: v ? 'default' : get().cursorVariant }),
  setCursor: (variant, label = '') => set({ cursorVariant: variant, cursorLabel: label }),

  setCoords: (c) => set({ coords: c }),
  setViewRotation: (r) => set({ viewRotation: r }),
  resetView: () =>
    set((s) => ({
      resetNonce: s.resetNonce + 1,
      viewRotation: DEFAULT_ROTATION,
      coords: DEFAULT_COORDS,
    })),
  triggerGlitch: () => set((s) => ({ glitchNonce: s.glitchNonce + 1 })),

  setActiveSection: (id) => set({ activeSection: id }),

  setScroll: (metrics) => {
    const prev = get().scroll
    if (
      Math.abs(prev.y - metrics.y) < 1 &&
      Math.abs(prev.progress - metrics.progress) < 0.0004 &&
      Math.abs(prev.heroProgress - metrics.heroProgress) < 0.0008
    ) {
      return
    }
    set({ scroll: metrics })
  },

  setEnv: (env) => {
    const prev = get().env
    if (
      prev.from === env.from &&
      prev.to === env.to &&
      Math.abs(prev.mix - env.mix) < 0.004 &&
      Math.abs(prev.travel - env.travel) < 0.0004
    ) {
      return
    }
    set({ env })
  },

  setWorldMode: (mode, source = '') => {
    if (get().worldMode === mode && get().worldModeSource === source) return
    set({ worldMode: mode, worldModeSource: source })
  },
}))

/** sensible default world per section — sections may override it themselves */
export const WORLD_BY_SECTION: Record<string, WorldMode> = {
  top: 'space',
  actualites: 'hall',
  projets: 'hall',
  'a-propos': 'blueprint',
  studio: 'grid',
  contact: 'grid',
  footer: 'outro',
}

/**
 * The colour each world washes over the *DOM* — the same story the WebGL
 * palettes tell, published to CSS as `--tint-r/g/b` (App.tsx blends the two
 * worlds the viewport sits between, every frame, so the page's ambient colour
 * travels with the camera instead of cutting at a section boundary).
 *
 * Kept in plain RGB: blending two hues through a colour wheel can swing the
 * page through green on its way from violet to paper, whereas straight RGB
 * always takes the short, quiet path.
 */
export const WORLD_TINT: Record<WorldMode, [number, number, number]> = {
  space: [176, 176, 176],
  hall: [138, 143, 154],
  blueprint: [86, 88, 138],
  grid: [126, 132, 132],
  outro: [168, 62, 52],
}

/** read the current view rotation without subscribing (used inside rAF loops) */
export const readViewRotation = () => useAppStore.getState().viewRotation
