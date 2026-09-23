import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import WallRoom, { type RoomDriver } from './Room'
import Emblem, { type EmblemShape } from './Emblem'
import { createEnvelope, type Envelope } from './envelope'
import { createFeed, type Feed, type FeedChannel, type Sprite } from './feed'
import { createRoom, sampleRoom } from './mood'
import { useGlobalPointer } from './pointer'
import './screen-wall.css'

/**
 * A wall of screens, ready to drop anywhere.
 *
 * This is the whole thing in one component: the room (a curved wall of screens
 * under a slowly changing light), the picture it broadcasts (words written
 * across the cells, drawings, a sea, a page, a runner), and an emblem in front
 * of it — the cut stone, or a letter built out of bars. It owns its own clock,
 * so it needs nothing from the host but a box to live in.
 *
 * Written to be a *footer*: give it a height, ask for the fade at the top, and
 * let the page's own content sit over it. Nothing here reads a store, a route
 * or a stylesheet of the project it came from.
 *
 * ```tsx
 * import ScreenWall from './wall/ScreenWall'
 *
 * <footer style={{ height: 420 }}>
 *   <ScreenWall words={['APPS', 'WEBSITE', 'LOGO']} emblem="monogram" fade={28} />
 * </footer>
 * ```
 */

export type ScreenWallProps = {
  /** what the wall writes, in order (it wraps) */
  words?: string[]
  /** the object in front of the wall */
  emblem?: EmblemShape
  /** seconds between two broadcasts */
  every?: [number, number]
  /** how long one broadcast lasts */
  duration?: number
  /** which channels may play, and how long each holds */
  channels?: Partial<Record<FeedChannel, number>>
  /** your own sprites, played through the cells */
  runner?: Sprite[]
  chaser?: Sprite
  /** images played screen by screen (URLs) */
  photos?: string[]
  /** height of the fade at the top of the frame, in % (0 = none) */
  fade?: number
  /** size of one screen, in world units */
  cell?: number
  /** 0 → 1: how bright the room is */
  intensity?: number
  /** 0 → 1: how hard the cursor pulls the surface */
  pull?: number
  className?: string
}

/** the room's resting light: a dark hall whose colour drifts with `mood.ts` */
function footerPalette(cell: number, intensity: number) {
  return {
    cell,
    major: cell * 8,
    tileW: cell * 4,
    tileH: cell * 3,
    fogK: 0.03,
    lineGain: 0.3 * intensity,
    majorGain: 0.3 * intensity,
    glowGain: 0.34 * intensity,
    tileGain: 0.6 * intensity,
    streak: 0.9 * intensity,
    vignette: 1,
    radius: 7.6,
    floorY: -1.5,
  }
}

export default function ScreenWall({
  words,
  emblem = 'gem',
  every = [10, 17],
  duration = 7.2,
  channels,
  runner,
  chaser,
  photos,
  fade = 26,
  cell = 0.85,
  intensity = 1,
  pull = 0.13,
  className,
}: ScreenWallProps) {
  const feed: Feed = useMemo(() => createFeed({ channels, runner, chaser, photos }), [channels, runner, chaser, photos])
  const room = useMemo(() => createRoom(), [])
  const palette = useMemo(() => footerPalette(cell, intensity), [cell, intensity])
  const envelope: Envelope = useMemo(() => createEnvelope({ words, every, duration }), [words, every, duration])
  const lastMoment = useRef(0)
  const reduced = useRef(false)
  /* the wall answers the cursor wherever it is dropped: the listeners belong
     to the module, not to the host page */
  useGlobalPointer()

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced.current) {
      /* one still broadcast, then silence: the wall shows a picture instead of
         a loop when the visitor asked for less motion */
      envelope.speak(words?.[0] ?? 'NEVOLABS', 60)
      return
    }
    envelope.start()
    return () => envelope.stop()
  }, [envelope, words])

  useEffect(() => () => feed.dispose(), [feed])

  const drive: RoomDriver = useMemo(
    () => (u, frame) => {
      sampleRoom(frame.time, room)
      /* the footer sits still: the camera holds its place and only breathes,
         which is what makes the wall read as a surface rather than a journey */
      const camera = frame.camera
      camera.position.set(0, 0.55, 6)
      camera.rotation.z = Math.sin(frame.time * 0.07) * 0.004

      u.uBase.value.copy(room.base)
      u.uLine.value.copy(room.line)
      u.uMajor.value.copy(room.major)
      u.uGlow.value.copy(room.glow)
      u.uTile.value.copy(room.panel)
      u.uCell.value = palette.cell
      u.uMajorCell.value = palette.major
      u.uTileW.value = palette.tileW
      u.uTileH.value = palette.tileH
      u.uFogK.value = palette.fogK
      u.uLineGain.value = palette.lineGain
      u.uMajorGain.value = palette.majorGain
      u.uGlowGain.value = palette.glowGain
      u.uTileGain.value = palette.tileGain
      u.uStreak.value = palette.streak
      u.uVignette.value = palette.vignette
      u.uRadius.value = palette.radius
      u.uFloorY.value = palette.floorY
      u.uSheet.value = 0
      /* there is no ground in front of a footer's wall: the lattice would read
         as a grid of cells on the floor of the page */
      u.uGround.value = 0
      u.uTravel.value = 0
      u.uHero.value = 0
      u.uWallOff.value = 0

      const moment = envelope.moment()
      if (moment && moment.nonce !== lastMoment.current) {
        lastMoment.current = moment.nonce
        u.uCutSeed.value = moment.seed
      }
      u.uScreen.value = envelope.cut(frame.time)
      if (moment) feed.update(moment.word, moment.seed, envelope.phase(frame.time), moment.duration)
    },
    [envelope, feed, palette, room],
  )

  return (
    <div className={className ? `screen-wall ${className}` : 'screen-wall'} style={{ ['--wall-fade' as string]: `${fade}%` }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
        camera={{ position: [0, 0.55, 6], fov: 54, near: 0.1, far: 90 }}
        style={{ pointerEvents: 'none' }}
      >
        <Suspense fallback={null}>
          <WallRoom feed={feed} drive={drive} />
          <ambientLight intensity={0.5} />
          <FittedEmblem shape={emblem} pull={pull} />
        </Suspense>
      </Canvas>
      {/* the fade: the wall has no top edge, it dissolves into the page above */}
      <div className="screen-wall__fade" aria-hidden="true" />
      <div className="screen-wall__grain" aria-hidden="true" />
    </div>
  )
}

/**
 * The emblem is sized from the *box it stands in*, never from a magic number:
 * the same component has to look right in a 320px footer and in a full-screen
 * key visual.
 */
function FittedEmblem({ shape, pull }: { shape: EmblemShape; pull: number }) {
  const height = useThree((s) => s.viewport.height)
  const size = Math.min(2.1, Math.max(0.55, height * 0.27))
  return <Emblem shape={shape} pull={pull} size={size} />
}
