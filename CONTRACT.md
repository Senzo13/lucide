# LUCIDE — shared build contract

Read this file completely before writing a single line. It is the only source of
truth for file ownership, the public API between layers, and the visual target.

## 1. Mission

Rebuild the reference site (`alche.studio`) as **LUCIDE**, a French realtime
creative studio, matching the supplied screenshot as closely as possible:

- full-bleed WebGL hero: perspective grid wall, giant refractive crystal,
  drifting wireframe triangles, deep violet/blue grade, CRT scanlines
- giant centred `LUCIDE` wordmark with the crystal composited **over** it
- dense mono HUD (left baseline, right realtime 3D view panel + news ticker)
- sound-consent bar pinned to the bottom of the viewport
- everything below the fold continues the same language: news, projects,
  about/manifesto, studio, contact, footer

The screenshot is the pixel reference. Reproduce proportions, spacing, type
scale, colour and layering — not an approximation.

## 2. Stack (already installed — do **not** add dependencies)

`react` `react-dom` `three` `@react-three/fiber` `@react-three/drei`
`@react-three/postprocessing` `postprocessing` `gsap` (ScrollTrigger) `lenis`
`motion` `zustand` `split-type` `troika-three-text` `howler` `react-hook-form`
`zod` `@hookform/resolvers` `maath` `clsx`
fonts: `@fontsource-variable/{archivo,inter,jetbrains-mono}`
tooling: `vite` `typescript` `@vitejs/plugin-react`

TypeScript is **strict**. `npm run build` must pass with zero errors.

## 3. File ownership — only edit files you own

| Owner | Paths |
| --- | --- |
| **lead** | `index.html`, `vite.config.ts`, `tsconfig.json`, `src/main.tsx`, `src/App.tsx`, `src/App.css`, `src/styles/**`, `src/store/**`, `src/content/**`, `src/lib/scroll.ts`, `src/lib/animate.ts`, `CONTRACT.md` |
| **agent-scene** | `src/three/**` (`Backdrop.tsx`, `Corridor.tsx`, `palette.ts`, `Crystal.tsx`, `Drift.tsx`, `WordmarkGhost.tsx`, `Effects.tsx`, `Scene.tsx`, `pointer.ts`, `Scene.css`) |
| **agent-chrome** | `src/components/**`, `src/lib/audio.ts` |
| **agent-sections** | `src/sections/**` |

You may **read** anything. Never write outside your paths — not even "small
fixes". If you need a change elsewhere, note it in your final report instead.

Every component/section imports its own CSS file next to it
(`Header.tsx` → `Header.css`). Do not create global stylesheets.

## 4. Layering (fixed, do not change)

```
0   canvas (three/Scene)          --z-canvas
5   .app-shade gradient overlay   (owned by lead)
10  Scanlines / CRT overlay       --z-content? no: sits above canvas, below UI
20  main content (sections)       --z-content
40  chrome: Header, SoundBar      --z-chrome
60  SideMenu overlay              --z-menu
80  Cursor                        --z-cursor
100 Loader                        --z-loader
```

Sections live in normal document flow inside `<main>`; the canvas is
`position: fixed; inset: 0` for the whole document. The key-visual layer stops
being drawn once the hero is scrolled past, but the **backdrop never goes
away**: it is the corridor the camera keeps travelling through, and every
section paints a translucent scrim over it (`.band`) instead of an opaque
panel, so the world stays visible and keeps changing behind the content.

## 5. Public API

### 5.1 `src/store/useAppStore.ts` (zustand)

```ts
useAppStore() // full state + actions
useAppStore(s => s.audioEnabled) // selector style
readViewRotation() // non-reactive getter inside rAF loops
```

State: `progress`, `sceneReady`, `loaded`, `audioDecision ('pending'|'on'|'off')`,
`audioEnabled`, `audioLevels: number[]`, `menuOpen`, `cursorVariant`
(`'default'|'hover'|'drag'|'view'|'text'`), `cursorLabel`, `coords {x,y,z,w}`,
`viewRotation [x,y,z]`, `resetNonce`, `glitchNonce`, `activeSection`.
`scroll {y, progress, heroProgress}` (live scroll metrics) and
`env {from, to, mix, travel, center}` (live environment blend — see 5.2c).

Actions: `setProgress(n)`, `setSceneReady(v)`, `setLoaded(v)`, `decideAudio(v)`,
`toggleAudio()`, `setAudioLevels(levels)`, `setMenuOpen(v)`,
`setCursor(variant, label?)`, `setCoords(c)`, `setViewRotation(r)`, `resetView()`,
`triggerGlitch()`, `setActiveSection(id)`, `setScroll(metrics)`, `setEnv(env)`,
`setWorldMode(mode, source?)`.

### 5.2 `src/lib/scroll.ts` (lead)

`initSmoothScroll()`, `destroySmoothScroll()`, `getLenis()`,
`scrollToSection(selector | element, offset?)`, `stopScroll(boolean)`,
re-exports `gsap` and `ScrollTrigger` (already registered).

Use `scrollToSection(href)` for **every** in-page anchor. Any GSAP ScrollTrigger
you create must be killed on unmount.

### 5.2b `--hero-p` — hero pin progress (lead writes, everyone reads)

`App.tsx` writes `--hero-p` on `documentElement` every animation frame while
scrolling: `0` at the top, `1` when the one-viewport pin of the hero is over,
up to `1.3` while the hero scrolls out of frame. It is a plain number, so CSS
can derive anything from it, e.g.

```css
.scene-layer--front {
  opacity: clamp(0, calc((1.14 - var(--hero-p, 0)) / 0.16), 1);
}
```

Rules: never re-declare `--hero-p` on a descendant (it would shadow the root
value), always use the `var(--hero-p, 0)` fallback, and read
`useAppStore.getState().scroll.heroProgress` (clamped to 0 → 1) inside WebGL
frame loops instead of listening to scroll events.

`.hero` is `200vh` tall and `.hero__stage` is the `sticky` 100vh layer that
holds the whole key visual; the sections after it simply slide over the pinned
stage.

### 5.2c The journey — `env` + `src/three/palette.ts` (agent-scene)

The reference does not freeze its background after the key visual: the camera
keeps diving and the environment swaps as the document is scrolled (deep dark
hall → light blueprint sheet → black technical grid → outro). That is what
`env` carries.

`App.tsx` measures every `[data-section]` once (and on resize), turns the list
into an ordered ladder of `WorldMode`s via `WORLD_BY_SECTION`, and publishes —
at ~30 fps, in the same rAF loop as `--hero-p` —

```ts
setEnv({ from, to, mix, travel, center })
```

- `from` / `to` — the two worlds the viewport centre currently sits between
- `mix` — smoothstepped 0 → 1 blend between them (never a hard cut)
- `travel` — whole-document progress 0 → 1, i.e. how far the camera has dived
- `center` — viewport centre in scroll pixels (QA / debugging)

`App.tsx` also mirrors the nearest world on
`document.documentElement.dataset.world`, which is what flips the page to the
light “blueprint sheet” (see `src/styles/global.css`). That attribute must
only ever be written from the lead's rAF loop.

`src/three/palette.ts` owns the environment tables (`PALETTES`, one entry per
`WorldMode`) and `blendPalette(env, out)` — used by `Backdrop.tsx` (shader
uniforms) and `Corridor.tsx` (hanging panels) so the whole environment moves
together. Never allocate a palette per frame: `createPalette()` once, then
blend into it.

`Backdrop.tsx` ray-marches an **endless corridor** (floor, ceiling, two side
walls, plus a facing grid wall that stands in for the mock's key visual) in a
single fullscreen pass, and dollies the shared camera with `travel`; the grid
planes are world-anchored, so scrolling streams the structure past the camera
instead of sliding a texture.

### 5.3 `src/lib/animate.ts` (lead)

`splitReveal(el, {stagger,y,delay})`, `revealUp(targets, {y,delay,stagger,trigger})`,
`scramble(el, finalText, duration)` — all return a cleanup function.

### 5.4 `src/lib/audio.ts` (agent-chrome)

```ts
export type AudioEngine = {
  init(): Promise<void>
  enable(): Promise<void>
  disable(): void
  toggle(): Promise<void>
  setVolume(v: number): void
  get enabled(): boolean
}
export const audio: AudioEngine
export function subscribeLevels(cb: (levels: number[]) => void): () => void
```

Web Audio only (Howler optional). No external audio files: synthesise the
ambient bed (drone + filtered noise + slow LFO) and a tiny UI click. Must only
start after `decideAudio('on')` / `toggleAudio()` — never autoplay. Levels feed
`setAudioLevels` so the header bars and the bottom bar can animate.

### 5.5 `src/three/Scene.tsx` (agent-scene)

Default export `Scene` renders one `<Canvas>`:

- fixed full-viewport, `pointer-events: none` on the wrapper **except** an inner
  `pointer-events: auto` drag surface for orbiting the crystal
- reads `useAppStore`: `viewRotation`, `resetNonce`, `glitchNonce`, `loaded`,
  `sceneReady`; writes `setCoords` (~20 fps max) and `setSceneReady(true)` after
  the first frame
- `<Suspense>` fallback must be `null` (never throw)
- dpr capped at `[1, 2]`, `gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}`
- must run headless-safe: no `window` access at module scope

### 5.6 `src/components/**` (agent-chrome) — signatures the sections depend on

```ts
export default function Header(): JSX.Element        // fixed top chrome
export default function SideMenu(): JSX.Element      // fullscreen nav overlay
export default function SoundBar(): JSX.Element      // bottom consent bar
export default function Cursor(): JSX.Element        // custom cursor
export default function Loader(): JSX.Element        // intro overlay
export default function Scanlines(): JSX.Element     // CRT overlay, pointer-events none
export default function HeroType(props: { text?: string; className?: string }): JSX.Element
export default function ViewGizmo(): JSX.Element     // right realtime 3D HUD
```

`HeroType` renders **only** the giant wordmark (`text` defaults to
`site.name`), sized with `--fs-wordmark`, and must be safely composable over
the WebGL crystal (no background, `mix-blend-mode: normal`, transparent).

`ViewGizmo` renders the whole right-hand HUD block: `VUE 3D TEMPS RÉEL`,
coordinate dots row bound to `coords`, the circular interactive gizmo
(drag → `setViewRotation`), and `RÉINITIALISER LA VUE` → `resetView()`.

## 6. Visual spec (from the screenshot — 1512×850 baseline)

Colour

| token | value | use |
| --- | --- | --- |
| `--bg-0` | `#05030f` | page base |
| `--bg-2` | `#150a33` | violet wash |
| `--violet-bright` | `#a855f7` | crystal core glow |
| `--magenta` | `#d946ef` | rim / caustics |
| `--grid-blue` | `#3a49c9` | perspective grid lines |
| `--orange` | `#ff6a1a` | drifting triangles |
| `--cyan` | `#67e8f9` | refraction highlights |
| `--ink-dim` | `rgba(255,255,255,.66)` | mono labels |
| `--line` | `rgba(255,255,255,.16)` | hairlines |

Type

| role | family | size | notes |
| --- | --- | --- | --- |
| wordmark | `--font-wordmark` — Inter Variable **700** | `--fs-wordmark` = `clamp(46px, min(19.2vw, 34.2vh), 420px)` | measured against the mockup: cap-height 25.8% of the viewport height, ink width 69% of its width, cap centred at 48% of the height, `width/cap 4.73`. No `scaleY`, no glow: flat crisp white |
| H2 | display | `--fs-h2` | uppercase, one-line punch |
| nav | `--font-sans` | `--fs-nav` (~17px) | regular weight, no uppercase |
| mono HUD | `--font-mono` | `--fs-mono` (11–12px) | uppercase, `letter-spacing .16em`, `line-height 1.9` |
| body | `--font-sans` | `--fs-body` | `--ink-dim` for support copy |

Layout (desktop)

- page gutter `--pad-x` ≈ 40px; header top ≈ 34px, logo cap-height ≈ 22px
- header: logo left · nav centred (4 items, ~52px apart) · right cluster =
  `Contact / Recrutement` pill + sound toggle (3 vertical bars, 2px wide, 14px tall)
- hero left rail (top ≈ 15vh): `CRÉER / DES MONDES / PLUS CLAIRS` + 26px rule
- hero left rail (bottom ≈ 26vh): `ART / TECHNOLOGIE / EXPÉRIENCES` + rule
- hero bottom-left (just above the sound bar): `LUCIDE v1.0` + 34px rule
- right HUD (top ≈ 14vh): `VUE 3D TEMPS RÉEL`, coordinate dots row
  (`-0.4 0.0 +0.2 1.0`), 120px circular 3D gizmo (green up / red right / blue
  centre / grey orbiting ball), `RÉINITIALISER LA VUE` below
- right column (bottom ≈ 10vh): `ACTUALITÉS` + 40px rule, then the three news
  rows: mono date, uppercase title (max 2 lines), arrow `→` flush right
- bottom bar `--bar-h` ≈ 62px, black, `1px` top hairline:
  equaliser glyph + `SON` │ question │ `Activer le son` pill + `Continuer sans son`
  underline link │ `POWERED BY NEVOLABS`

Motion: page-load mask reveal, wordmark letters rising with blur, crystal
idle rotation + mouse parallax, scanline sweep, glitch bursts on
`glitchNonce`, magnetic cursor, hover states that slide text out and back
(`.u-pill`), section content revealing on scroll.

Scroll choreography (must match the reference's feel — the camera never
stops):

- one continuous dolly from `y = 0` to the footer: `heroProgress` pushes
  through the wordmark, `env.travel` then sinks the camera ~30 world units
  deeper, with the corridor's floor/ceiling/side grids streaming past;
- the environment is blended, never swapped: space → hall → blueprint →
  grid → outro, driven by the section ladder;
- the manifesto chapter flips the page to the light “blueprint” sheet
  (`html[data-world="blueprint"]` inverts the ink/surface tokens) before the
  dark grid comes back for studio/contact;
- the backdrop is always drawn at full strength below the fold (`.scene-layer--back`),
  and `.band` stays a scrim so the world reads through the sections.

## 7. Quality bar

- Desktop-first fidelity, but nothing may overflow or overlap below 1024px;
  below 900px collapse the nav into the side menu and stack the hero rails.
- `prefers-reduced-motion: reduce` → no smooth scroll, no looping motion.
- Semantic HTML, `alt`/`aria-label` on interactive elements, keyboard focus
  visible, menu closable with `Escape`.
- No `any`, no unused imports, no `console.log` left behind.
- Anything WebGL must degrade to the gradient background if it throws.

## 8. Reporting

When done, report: files written, export signatures, what you verified
(typecheck/build/dev-server evidence), and anything the lead must wire up.
