# ScreenWall

A wall of screens that writes words across its own cells, plays pictures
through them, deforms under the cursor, and holds a piece of liquid glass in
front of it. Built to be dropped into another project as a **footer
background** — or as anything else you want a wall of screens behind.

Nothing in this folder knows about the site it came from: no store, no router,
no design system, no page. The only dependencies are `react`, `three` and
`@react-three/fiber`.

## Install

1. Copy the whole folder into your project, e.g. `src/wall/`.
2. Import the stylesheet **once**, anywhere in your app:

   ```ts
   import './wall/screen-wall.css'
   ```

3. Render it in a box that has a height and a `position`:

   ```tsx
   import ScreenWall from './wall/ScreenWall'

   export function Footer() {
     return (
       <footer className="footer">
         <ScreenWall
           words={['APPS', 'WEBSITE', 'LOGO', 'NEVOLABS']}
           emblem="monogram"
           fade={30}
         />
         <div className="footer__inner">…your links, wordmark, legal…</div>
       </footer>
     )
   }
   ```

   ```css
   .footer {
     position: relative;
     height: 420px;
     isolation: isolate; /* keeps the wall's stacking inside the footer */
     --wall-fade-color: #060607; /* the colour the fade dissolves into */
   }
   .footer__inner {
     position: relative;
     z-index: 1; /* your content sits over the wall */
   }
   ```

That is the whole integration. The wall is `pointer-events: none`, so links and
buttons above it keep working.

## Props

| prop | type | default | what it does |
| --- | --- | --- | --- |
| `words` | `string[]` | `['LUCIDE', 'TEMPS RÉEL', 'SIGNAL']` | what the wall writes, in order (it wraps) |
| `every` | `[number, number]` | `[10, 17]` | seconds between two broadcasts, randomised |
| `duration` | `number` | `7.2` | how long one broadcast lasts |
| `emblem` | `'gem' \| 'monogram'` | `'gem'` | the object in front of the wall |
| `channels` | `Partial<Record<FeedChannel, number>>` | all on | which channels may play, and how long each holds (`0` removes one) |
| `runner` / `chaser` | `Sprite[]` / `Sprite` | built in | your own pixel sprites (rows of cells, blown up to screen size) |
| `photos` | `string[]` | `[]` | images played screen by screen (URLs) |
| `videos` | `VideoClip[]` | `[]` | short muted extracts (`{ src, label }`), loaded on first use |
| `nevomon` | `string[]` | `[]` | transparent images (GIF welcome) for the advertisement, same origin as the page |
| `fade` | `number` | `26` | height of the fade at the top, in % (`0` = none) |
| `screenRows` | `number` | `6` | how many rows of cells the band occupies (a tall footer wants more) |
| `cell` | `number` | `0.85` | size of one *cell of content*, in world units (`screenRows × cell` is the band's height) |
| `intensity` | `number` | `1` | how bright the room is |
| `emblemCenter` | `number` | `0.59` | where the object stands in the box, `0` (top) → `1` (bottom) |
| `emblemScale` | `number` | `1` | size of the object, as a share of the box |
| `mood` | `MoodSpec \| MoodOptions` | ours | your colour cycle, as plain hex data or a built one |
| `pull` | `number` | `0.13` | how hard the cursor pulls the emblem's surface |
| `distort` | `number` | `1` | how far the wall itself answers the cursor |
| `follow` | `number` | `1` | how willing the object is to follow the cursor |
| `joint` | `number` | `0.9` | how dark the joint between two screens is |
| `dpr` | `[number, number] \| number` | `[1, 2]` | device pixel ratio cap |
| `active` | `boolean` | `true` | `false` freezes the frame (host knows it is off screen) |
| `className` | `string` | — | added to the `.screen-wall` box |

### The fade, and where the object stands

Two things a host usually has to tune:

- **`fade`** is a long, *bottom-light* gradient in the host's own colour
  (`--wall-fade-color`, set on the box): opaque on the frame's edge, then gone.
  Because both ends are invisible, the wall looks like it dissolves on its own
  rather than ending under a band — which is why the fade wants to be long: the
  top rows of cells should *climb* into the page, not be cut. The fade sits
  between the wall and the glass, so a host's wordmark is never veiled.
  The gradient is **radial**, centred above the frame, so the dissolve is an
  *arc*: it plunges in the middle and lifts at the sides, and the higher a cell
  climbs the fainter it is. That is the whole difference between a wall that
  fades into a page and a wall that stops under a band.
- **`emblemCenter`** is a fraction of the box, nothing else: the frame's centre
  is the world's origin (`@react-three/fiber` aims the camera at `(0, 0, 0)`),
  so `0.5` lands the object on a word that the host centred in the same box.
  Its size follows the box too: the object is measured against the box's height
  and width (`min(height, width * 0.78)`), which is what keeps a monogram
  readable in a wide footer *and* present in a narrow one — without that brake a
  phone-sized footer has a letter that eats the whole band.

### Taking the object in your hand

The object is **grabbable**: press it (mouse or finger) and it follows your
hand, leaning into the gesture; let go and it eases back to its place, so the
host's composition heals itself. The grab area is a pad centred on the object
and nothing else — `touch-action: none` is set there and only there, so on a
phone a swipe anywhere else in the footer still scrolls the page.

Where the band is drawn follows the same idea: the module places it so it is
**anchored at the bottom** of what the camera can see, then lets the fade dim
its upper rows. A band centred on the box would spend half its life behind the
host's wordmark (and, in a short footer, under the edge of the frame).

### How fine the wall is

The wall is a **grid of screens**, and `SCREEN_RES` (in `feed.ts`) says how many
screens make up one *cell of content* — the unit the band is laid out in (an
eight-letter word takes eight cells, a figure about two). At `SCREEN_RES = 16`
each cell of content is carried by **256 screens**: four times finer than the
first version, for the same canvas weight.

Two things follow, and both matter more than the raw figure:

- **The figures are drawings, not mosaics.** A sprite used to be a matrix of
  five cells — a Mario five blocks high. A figure is now painted once into a
  small canvas *at screen resolution* (a pixel of the drawing lights one
  screen) and then placed screen by screen: forty-four pixels of drawing for
  Mario, so a cap, an eye, a moustache, dungarees and two boots.
- **The band is wider than the frame.** The wall turns all the way around the
  camera, so if the band were narrower than the field of view, its seam would
  land in the middle of the picture and the image would be cut in two — a car
  read twice, once on each side of the emblem. `DESIGN_COLS = 30` (480 screens,
  against the ~190 the frame shows) pushes that seam behind the camera.
  Everything that must be *seen* is therefore laid out against the visible
  width (`seenCols()` in `feed.ts`), which the host passes down every frame.

`cell` is the size of a content cell, so `screenRows × cell` is the height of
the band in world units: the camera sees 7.74 of them, so `6 × 1.29` fills a
footer exactly.

### Reading the wall, for real

Two query parameters make the wall auditable, and both are used by the scripts
in this repo:

- `?feed=video` (or any channel name) pins one channel, which is the only way to
  look at a beat for longer than the beat lasts;
- `?wall=1` publishes what the wall is doing right now on `window.__wall`
  (`beat`, `screen`, the band's rows…) and its painted canvas on
  `window.__wallFeed`.

### Channels

| channel | what the wall shows |
| --- | --- |
| `word` | a run of cells combining into one letter each, written then switched off letter by letter (the letter size follows the frame: a narrow phone writes smaller words instead of cutting them) |
| `mark` | a drawing made of lit squares, appearing then going out one at a time |
| `shapes` | a motif on every other cell, all at once, holding three seconds, then the light morphs and fades — triangle → circle → cross, and one take in three a tic-tac-toe board of circles and crosses |
| `wipe` | the transition between two takes: six gestures drawn at random — `damier` (checkerboard), `tornade` (squares spinning in place), `volet`, `diagonale`, `iris`, `pluie` (a digital scramble). `?feed=checker` still pins it, under its old name |
| `mario` | a plumber in a red cap and blue dungarees, running the band, jumping the bricks, taking the coin |
| `pac` | a yellow pacman chasing a single dot that will not be caught — four paths, drawn per take |
| `wave` | a sea: a swell travelling across the band, a breaking crest, foam |
| `page` | a picture scrolling screen by screen — your photo, or a drawn comic sheet |
| `video` | a short muted extract, spread over the cells, with its own caption written by the cells. It is framed on **what the frame shows** — one image, centred, never repeated — and it **plays once**: its playback rate is set so the extract ends just before the take does, and the transition takes over from there (no loop). A clip that has not loaded yet shows a *test card*, never a hole |
| `nevomove` | a ten-second advertisement: the walker, the creatures sweeping across, and the words |
| `runner` | a figure running across the wall, jumping the gaps, with something on his heels |

```tsx
<ScreenWall words={['APPS', 'WEBSITE']} channels={{ wave: 0, page: 2.2 }} />
```

### Your own sprites

A sprite is rows of cells. `#` is a lit screen, `.` is left alone, and `o` is a
screen left **dark inside a lit shape** — an eye, a tooth.

```ts
const run = [
  ['##.', '#o.', '.#.', '#.#'],
  ['##.', '#o.', '.#.', '.#.'],
]
const chaser = ['.###.', '#o#o#', '#.#.#']

<ScreenWall words={['APPS']} runner={run} chaser={chaser} />
```

The last frame of `runner` is the pose used in the air. A cell of your matrix is
blown up to six screens, so an old matrix keeps working — but it will stay
coarse.

The sprites that ship with the module are no longer matrices: they are
**figures** (`Figure` in `feed.ts`), a small canvas painted once at screen
resolution and placed a screen at a time. That is where the detail comes from —
`mario()` is a 34 × 44 drawing, and the wall shows all of it. Write your own the
same way: give `paint` a canvas context, draw in pixels, and the wall blits it.

### Your own letter

`emblem="monogram"` sculpts the shipped mark: an **N** made of three bars (two
stems and a slanted waist) subdivided enough to ripple. For another letter,
edit `monogramGeometry()` in `Emblem.tsx` — that function is the whole
definition of the mark, and everything else (the glass, the rim, the cursor
pull) is shared.

### Your own photos

Photo channels are read at cell resolution and blown up with smoothing off, so
an image is genuinely carried by the screens instead of being drawn over them.
Nothing is shipped; the wall falls back to a drawn comic sheet.

```tsx
import cover from './assets/cover.jpg'
<ScreenWall words={['APPS']} photos={[cover]} />
```

## How it is put together

| file | what lives there |
| --- | --- |
| `ScreenWall.tsx` | the public component: canvas, emblem, fade, its own clock |
| `Room.tsx` | the room shader (floor, ceiling, the curved wall) + the `drive` hook |
| `feed.ts` | the picture the screens carry — painted on the CPU, one canvas |
| `envelope.ts` | when the wall speaks, and how loud |
| `mood.ts` | the room's slow colour drift (all layers read the same sample) |
| `Emblem.tsx` | the liquid-glass object: `gem` or `monogram`, and its cursor pull |
| `pointer.ts` | the shared pointer every 3D layer reads |
| `screen-wall.css` | the box, the fade at the top, the grain |
| `demo.tsx` / `demo.css` | a host page that does nothing but use the component |

Two things are worth knowing before you change anything:

- **The room is one shader.** `Room.tsx` renders a single fullscreen quad that
  ray-marches the wall; the camera, the light and what the screens show are
  written each frame by a `drive` function. A host with its own choreography
  (a scroll, a scroll-timeline, an API) can pass its own `drive` and use
  `WallRoom` directly.
- **The wall's content is one CPU canvas.** The feed paints words, drawings and
  pictures into it, and the shader samples one cell of that canvas per screen.
  That is what makes a *run of cells* able to spell a letter, and what makes a
  picture read as a wall of monitors rather than as a texture laid over one.

## Performance and accessibility

- device pixel ratio is capped at `2`; the room is **one** draw call plus the
  emblem;
- the feed is repainted at 15 fps **only while a broadcast is playing**, and
  only when the take actually changes;
- `prefers-reduced-motion: reduce` stops the loop: the wall shows one still
  broadcast instead of animating;
- the canvas never takes a click (`pointer-events: none`), and the fade and
  grain are pure CSS;
- everything the module adds is decorative — keep your real content in the DOM
  above it, as the demo does.

## Demo

`wall.html` (at the root of this repo) mounts `demo.tsx`: a page whose only job
is to show the component used the way another project would use it.

```
npm run dev     # then open /wall.html
```
