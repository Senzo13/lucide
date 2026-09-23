import { useCallback, useMemo, useRef } from 'react'
import * as THREE from 'three'
import WallRoom, { type RoomFrame } from '../wall/Room'
import { createFeed, type Feed, type FeedChannel } from '../wall/feed'
import { pointer } from '../wall/pointer'
import { useAppStore } from '../store/useAppStore'
import { blendPalette, createPalette } from './palette'
import { createRoom, sampleRoom } from './mood'
import { wallCut, wallPhase } from './wall'

/**
 * The site's own room.
 *
 * The room itself — the shader, the screens, the hover field — lives in
 * `src/wall/` and knows nothing about this project. What is left here is the
 * *choreography*: where the camera stands for a given scroll, which world the
 * light comes from, and what the wall is broadcasting. Swapping that for
 * another project's choreography is the whole point of the split.
 */

/** photos dropped into `src/assets/feed/` are played on the wall, screen by
    screen; nothing is required, the wall falls back to its drawn sheet */
const FEED_PHOTOS = Object.values(
  import.meta.glob('../assets/feed/*.{png,jpg,jpeg,webp,avif}', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>,
)

/** one feed for the whole page: the wall keeps its take between two frames */
const feed: Feed = createFeed({ photos: FEED_PHOTOS })

/* QA escape hatch: `?feed=wave` pins one channel on the wall */
if (typeof window !== 'undefined') {
  const pinned = new URLSearchParams(window.location.search).get('feed') as FeedChannel | null
  if (pinned) feed.pin(pinned)
}

export default function Backdrop() {
  const palette = useMemo(() => createPalette(), [])
  const room = useMemo(() => createRoom(), [])
  /** last time the room was published to CSS (the DOM wash rides the room) */
  const publishedAt = useRef(-1)
  /** the wall's written moment: which one, what it says, and for how long */
  const momentNonce = useRef(0)
  const momentWord = useRef('')
  const momentSeed = useRef(0)
  const momentDuration = useRef(7.2)

  const drive = useCallback(
    (u: Record<string, THREE.IUniform>, frame: RoomFrame) => {
      const store = useAppStore.getState()
      const hero = store.scroll.heroProgress
      const { travel } = store.env
      blendPalette(store.env, palette)
      sampleRoom(frame.time, room)
      /* The section ladder owns the *structure* of the room (how fine the grid
         is, how far it dissolves, whether it is paper), but the colour is the
         room's: it turns every couple of seconds, everywhere at once. Paper
         keeps its own ink — a coloured wash over a light sheet is a stain. */
      const dark = 1 - palette.sheet

      /* The room travels with the camera: the cylinder is centred on it, so the
         wall always wraps around the view and its vanishing point stays put
         while the floor and the panels stream past below. */
      const camera = frame.camera
      camera.position.x = pointer.x * 0.42
      camera.position.y = 0.55 + pointer.y * 0.16 - hero * 0.35 - travel * 0.5
      camera.position.z = 6 - travel * 26
      camera.rotation.z = pointer.x * 0.012 + Math.sin(frame.time * 0.07) * 0.004

      u.uTravel.value = travel
      u.uHero.value = hero
      u.uWallOff.value = travel * 9

      u.uBase.value.copy(palette.base).lerp(room.base, dark)
      u.uLine.value.copy(palette.line).lerp(room.line, dark)
      u.uMajor.value.copy(palette.major).lerp(room.major, dark)
      u.uGlow.value.copy(palette.glow).lerp(room.glow, dark)
      u.uCell.value = palette.cell
      u.uMajorCell.value = palette.majorCell
      u.uFogK.value = palette.fogK
      u.uLineGain.value = palette.lineGain
      u.uMajorGain.value = palette.majorGain
      u.uGlowGain.value = palette.glowGain
      u.uTileW.value = palette.tileW
      u.uTileH.value = palette.tileH
      u.uTileGain.value = palette.tileGain
      u.uTile.value.copy(palette.base).lerp(room.panel, dark)
      u.uStreak.value = palette.streak
      u.uSheet.value = palette.sheet
      u.uVignette.value = palette.vignette
      u.uRadius.value = palette.radius
      u.uFloorY.value = palette.floorY
      u.uGround.value = palette.ground

      /* ---- the wall's broadcast moment ----------------------------------
         The DOM publishes what should be written and for how long; the shader
         does the writing. The envelope is computed per frame, so the moment
         fades in, steps through its beats and fades out without anything on
         the DOM side running a timer. */
      const moment = store.wallMoment
      if (moment && moment.nonce !== momentNonce.current) {
        momentNonce.current = moment.nonce
        u.uCutSeed.value = moment.seed
        momentWord.current = moment.word
        momentSeed.current = moment.seed
        momentDuration.current = moment.duration
      }

      /* one clock for both canvases: the gem reads the same envelope, so the
         light the screens throw is the light the stone catches */
      const at = performance.now() / 1000
      u.uScreen.value = wallCut(at)
      feed.update(momentWord.current, momentSeed.current, wallPhase(at), momentDuration.current)

      /* The DOM scrim takes the room's light too: the page's own wash turns
         with the backdrop, so the whole frame changes colour and not just the
         canvas. Throttled to ~10 writes a second — during a crossfade that is
         enough for the naked eye, and it keeps the style engine out of the
         frame loop. */
      if (frame.time - publishedAt.current > 0.09 || publishedAt.current < 0) {
        publishedAt.current = frame.time
        const hex = room.line.getHex(THREE.SRGBColorSpace)
        const style = document.documentElement.style
        style.setProperty('--room-r', String((hex >> 16) & 255))
        style.setProperty('--room-g', String((hex >> 8) & 255))
        style.setProperty('--room-b', String(hex & 255))
        style.setProperty('--room-a', dark.toFixed(3))
      }
    },
    [palette, room],
  )

  return <WallRoom feed={feed} drive={drive} />
}
