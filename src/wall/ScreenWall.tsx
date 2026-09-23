import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import WallRoom, { type RoomDriver } from './Room'
import Emblem, { type EmblemShape } from './Emblem'
import { createEnvelope, type Envelope } from './envelope'
import { createFeed, type Feed, type FeedChannel, type Sprite } from './feed'
import { createMood, createRoom, moodFromSpec, sampleMood, type Mood, type MoodOptions, type MoodSpec } from './mood'
import { useGlobalPointer } from './pointer'
import styles from './screen-wall.module.css'

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
  /** how far the wall itself answers the cursor (1 = the studio's setting) */
  distort?: number
  /** how willing the object is to follow the cursor */
  follow?: number
  /** where the emblem stands in the box, 0 (top) → 1 (bottom) */
  emblemCenter?: number
  /** size of the emblem, as a share of the box's height (0.27 by default) */
  emblemScale?: number
  /** how dark the joint between two screens is (0.9 in a dark room) */
  joint?: number
  /**
   * Le cycle de couleurs de la marque : soit des couleurs écrites en clair
   * (`MoodSpec`, sans `three`), soit un cycle déjà construit.
   */
  mood?: MoodSpec | MoodOptions
  /** device pixel ratio cap: `[1, 2]` by default, lower for a cheaper frame */
  dpr?: [number, number] | number
  /** false freezes the frame — a host that knows the wall is off screen */
  active?: boolean
  /**
   * What sits *between* the wall and the glass: the host's wordmark, which the
   * emblem then cuts into. Two render layers are what make the key visual of
   * this module possible — a giant word behind a piece of glass.
   */
  children?: ReactNode
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
  distort = 1,
  follow = 1,
  emblemCenter = 0.59,
  emblemScale = 1,
  joint = 0.9,
  mood,
  dpr = [1, 2],
  active = true,
  children,
  className,
}: ScreenWallProps) {
  const feed: Feed = useMemo(() => createFeed({ channels, runner, chaser, photos }), [channels, runner, chaser, photos])
  const room = useMemo(() => createRoom(), [])
  const cycle: Mood = useMemo(
    () => (mood && 'rooms' in mood ? moodFromSpec(mood as MoodSpec) : createMood(mood as MoodOptions)),
    [mood],
  )
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
      sampleMood(cycle, frame.time, room)
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
      u.uDistort.value = distort
      u.uJoint.value = joint
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
    [cycle, distort, envelope, feed, joint, palette, room],
  )

  return (
    <div className={className ? `${styles.wall} ${className}` : styles.wall} style={{ ['--wall-fade' as string]: `${fade}%` }}>
      {/* Chaque toile a son propre conteneur positionné : compter sur le
          `className` de `<Canvas>` ne suffit pas (le wrapper interne de R3F
          reste dans le flux, et la seconde toile partait alors sous la
          première — donc hors du cadre). */}
      <div className={styles.layer}>
        <Canvas
        dpr={dpr}
        frameloop={active ? 'always' : 'never'}
        gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
        camera={{ position: [0, 0.55, 6], fov: 54, near: 0.1, far: 90 }}
        style={{ pointerEvents: 'none' }}
        >
          <Suspense fallback={null}>
            <WallRoom feed={feed} drive={drive} />
          </Suspense>
        </Canvas>
      </div>

      {/* The wall has no top edge: it dissolves into the page above. Drawn
          between the two layers, so the host's word is never faded. */}
      <div className={styles.fade} aria-hidden="true" />

      {/* the slice the host's wordmark lives in: in front of the wall, behind
          the glass — the whole point of the two layers */}
      {children ? <div className={styles.slot}>{children}</div> : null}

      <div className={`${styles.layer} ${styles.front}`}>
        <Canvas
          dpr={dpr}
          frameloop={active ? 'always' : 'never'}
          gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
          camera={{ position: [0, 0.55, 6], fov: 54, near: 0.1, far: 90 }}
          style={{ pointerEvents: 'none' }}
        >
          <Suspense fallback={null}>
            <ambientLight intensity={0.5} />
            <FittedEmblem
              shape={emblem}
              pull={pull}
              follow={follow}
              center={emblemCenter}
              scale={emblemScale}
              mood={cycle}
            />
          </Suspense>
        </Canvas>
      </div>

      <div className={styles.grain} aria-hidden="true" />
    </div>
  )
}

/**
 * The emblem is sized from the *box it stands in*, never from a magic number:
 * the same component has to look right in a 320px footer and in a full-screen
 * key visual.
 */
function FittedEmblem({
  shape,
  pull,
  follow,
  center,
  scale,
  mood,
}: {
  shape: EmblemShape
  pull: number
  follow: number
  center: number
  scale: number
  mood: Mood
}) {
  const height = useThree((s) => s.viewport.height)
  const width = useThree((s) => s.viewport.width)
  /* L'emblème se mesure à la *boîte*, pas à la caméra : sur un écran étroit, la
     hauteur visible est la même mais la largeur ne l'est pas — sans ce frein, le
     N d'un pied de page mobile prenait toute la bande et écrasait le mot. */
  const basis = Math.min(height, width * 0.28)
  const size = Math.min(2.1, Math.max(0.4, basis * 0.27 * scale))
  /* the camera sits half a unit above the origin and looks straight ahead, so
     the box's centre is y = 0.55: this is where the object has to stand to
     land on the fraction the host asked for */
  const lift = 0.55 + (0.5 - center) * height
  return <Emblem shape={shape} pull={pull} follow={follow} size={size} lift={lift} mood={mood} />
}
