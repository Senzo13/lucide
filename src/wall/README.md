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
| `runner` / `chaser` | `Sprite[]` / `Sprite` | built in | your own pixel sprites, played through the cells |
| `photos` | `string[]` | `[]` | images played screen by screen (URLs) |
| `fade` | `number` | `26` | height of the fade at the top, in % (`0` = none) |
| `cell` | `number` | `0.85` | size of one screen, in world units |
| `intensity` | `number` | `1` | how bright the room is |
| `pull` | `number` | `0.13` | how hard the cursor pulls the emblem's surface |
| `className` | `string` | — | added to the `.screen-wall` box |

### Channels

| channel | what the wall shows |
| --- | --- |
| `word` | a run of cells combining into one letter each, written then switched off cell by cell |
| `mark` | a drawing made of lit squares, appearing then going out one at a time |
| `wave` | a sea: a swell travelling across the band, a breaking crest, foam |
| `page` | a picture scrolling screen by screen — your photo, or a drawn comic sheet |
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

The last frame of `runner` is the pose used in the air. The sprites that ship
with the module are our own; pass yours and the wall plays them exactly the
same way.

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
