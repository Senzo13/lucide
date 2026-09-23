import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import WallRoom, { type RoomDriver } from './Room'
import Emblem, { type EmblemShape } from './Emblem'
import { createEnvelope, type Envelope } from './envelope'
import { SCREEN_RES, SCREEN_ROWS, createFeed, type Feed, type FeedChannel, type Sprite, type VideoClip } from './feed'
import { createMood, createRoom, moodFromSpec, sampleMood, type Mood, type MoodOptions, type MoodSpec } from './mood'
import { pointer, useGlobalPointer } from './pointer'
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
  /**
   * Hauteur de la bande d'écrans, en rangées de cases. Six par défaut ; un
   * pied de page haut en veut davantage, pour que les cases puissent monter
   * loin dans le fondu sans que ce qu'elles racontent sorte du cadre.
   */
  screenRows?: number
  /** which channels may play, and how long each holds */
  channels?: Partial<Record<FeedChannel, number>>
  /** your own sprites, played through the cells */
  runner?: Sprite[]
  chaser?: Sprite
  /** images played screen by screen (URLs) */
  photos?: string[]
  /**
   * Extraits vidéo joués *sur les cases* (voir `VideoClip`) : courts, muets,
   * chargés au premier passage seulement.
   */
  videos?: VideoClip[]
  /**
   * Les Nevomon de la publicité NevoMove (voir `feed.ts`) : des images de la
   * **même origine que le site**, sinon le canevas est teinté et la texture ne
   * se téléverse plus.
   */
  nevomon?: string[]
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

/**
 * Où la caméra se tient, et sous quel angle elle voit : deux nombres dont
 * dépend ce que la fenêtre montre du mur — c'est-à-dire, dans un pied de page,
 * combien de rangées de cases on peut espérer voir.
 */
const FOV = 54
const CAM_HEIGHT = 0.55
const CAM_DISTANCE = 6

/**
 * La lumière de la salle : un hall sombre dont la couleur dérive avec
 * `mood.ts`.
 *
 * `cell` est la taille d'une **case de contenu** (ce que l'hôte règle) ; les
 * écrans, eux, sont `SCREEN_RES` fois plus petits — c'est ce qui fait la
 * finesse du mur, sans changer un seul dessin (voir `feed.ts`).
 */
function footerPalette(cell: number, intensity: number) {
  const screen = cell / SCREEN_RES
  return {
    cell: screen,
    /** la taille d'une case de contenu : sert au placement de la bande */
    content: cell,
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
  screenRows = SCREEN_ROWS,
  channels,
  runner,
  chaser,
  photos,
  videos,
  nevomon,
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
  const photosKey = (photos ?? []).join('|')
  const videosKey = (videos ?? []).map((clip) => `${clip.src}|${clip.label ?? ''}`).join('~')
  const nevomonKey = (nevomon ?? []).join('|')
  const feed: Feed = useMemo(
    () => createFeed({ channels, runner, chaser, photos, videos, nevomon, rows: screenRows }),
    /* les listes sont comparées par *valeur* : un hôte écrit ses tableaux dans
       son JSX, et refabriquer la source à chaque rendu relancerait la vidéo et
       rechargerait les images */
    [channels, runner, chaser, photosKey, videosKey, nevomonKey, screenRows],
  )
  const room = useMemo(() => createRoom(), [])
  const cycle: Mood = useMemo(
    () => (mood && 'rooms' in mood ? moodFromSpec(mood as MoodSpec) : createMood(mood as MoodOptions)),
    [mood],
  )
  const palette = useMemo(() => footerPalette(cell, intensity), [cell, intensity])
  /* Une seule enveloppe pour toute la vie du composant : elle porte le *temps*
     du mur, et un rendu ne doit pas la remettre à zéro. Un hôte écrit
     `every={[5, 8]}` dans son JSX, ce qui fabrique un tableau neuf à chaque
     passage : avec une enveloppe recréée, la phrase était sans cesse repoussée
     de ses deux secondes d'attente et n'arrivait jamais. Les mots et le tempo
     se changent par `configure`, sans toucher au moment en cours. */
  const envelopeRef = useRef<Envelope | null>(null)
  if (!envelopeRef.current) envelopeRef.current = createEnvelope({ words, every, duration })
  const envelope = envelopeRef.current
  const wordsKey = words?.join('|') ?? ''
  useEffect(() => {
    envelope.configure({ words, every: [every[0], every[1]], duration })
  }, [envelope, wordsKey, every[0], every[1], duration])
  const lastMoment = useRef(0)
  const reduced = useRef(false)
  /** `?wall=1` publie l'état du mur dans la page (mise au point) */
  const debug = useRef(false)
  const firstTick = useRef(-1)
  /* the wall answers the cursor wherever it is dropped: the listeners belong
     to the module, not to the host page */
  useGlobalPointer()

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced.current) {
      /* one still broadcast, then silence: the wall shows a picture instead of
         a loop when the visitor asked for less motion. On entre *au milieu* du
         take (`-300` sur une durée de 600) : la phrase est déjà écrite quand la
         toile s'allume, et elle ne bouge plus qu'à l'échelle de dix minutes. */
      envelope.speak(words?.[0] ?? 'NEVOLABS', 600, -300)
      return
    }
    envelope.start()
    return () => envelope.stop()
  }, [envelope, words])

  useEffect(() => () => feed.dispose(), [feed])

  /* QA escape hatch: `?feed=mario` pins one channel (see `feed.ts`), which is
     the only way to look at a beat for longer than the beat lasts */
  useEffect(() => {
    const pinned = new URLSearchParams(window.location.search).get('feed')
    if (pinned) feed.pin(pinned as FeedChannel)
    debug.current = new URLSearchParams(window.location.search).get('wall') === '1'
  }, [feed])

  /* ---- la prise ---------------------------------------------------------
     Le mur ne prend aucun clic (c'est un fond), mais on doit pouvoir *tenir*
     l'emblème et le promener — à la souris comme au doigt. La pastille est donc
     posée autour de l'objet, et rien d'autre : ailleurs, la page défile
     normalement.

     Le geste est relatif : on mesure le déplacement depuis le point de prise,
     ramené à la demi-boîte. Lâché, l'objet revient à sa place en une seconde —
     la marque retrouve le centre du mot sans qu'on ait rien à faire. */
  const grabRef = useRef<HTMLDivElement>(null)
  const grabStart = useRef({ x: 0, y: 0 })
  const releaseRef = useRef<number | null>(null)

  useEffect(() => {
    const pad = grabRef.current
    const box = pad?.parentElement
    if (!pad || !box) return

    const easeHome = () => {
      if (releaseRef.current !== null) window.clearInterval(releaseRef.current)
      releaseRef.current = window.setInterval(() => {
        pointer.grab.x *= 0.86
        pointer.grab.y *= 0.86
        if (Math.abs(pointer.grab.x) < 0.002 && Math.abs(pointer.grab.y) < 0.002) {
          pointer.grab.x = 0
          pointer.grab.y = 0
          window.clearInterval(releaseRef.current as number)
          releaseRef.current = null
        }
      }, 16)
    }

    const onDown = (event: PointerEvent) => {
      const rect = box.getBoundingClientRect()
      grabStart.current = { x: event.clientX, y: event.clientY }
      pointer.grab.active = true
      pad.dataset.held = 'true'
      pad.setPointerCapture?.(event.pointerId)
      /* la boîte sert deux fois : à convertir le geste, et à le garder dedans */
      pad.dataset.w = String(rect.width)
      event.preventDefault()
    }

    const onMove = (event: PointerEvent) => {
      if (!pointer.grab.active) return
      const width = Number(pad.dataset.w) || box.clientWidth || 1
      const height = box.clientHeight || 1
      const x = ((event.clientX - grabStart.current.x) / (width * 0.5))
      const y = (-(event.clientY - grabStart.current.y) / (height * 0.5))
      /* on garde l'objet dans le cadre : au-delà, il sortirait de la bande et
         la marque n'aurait plus rien à couper */
      pointer.grab.x = Math.max(-0.42, Math.min(0.42, x))
      /* moins haut que large : l'objet ne doit pas sortir par le haut de la
         bande, où le fondu l'avalerait */
      pointer.grab.y = Math.max(-0.22, Math.min(0.22, y))
    }

    const onUp = () => {
      if (!pointer.grab.active) return
      pointer.grab.active = false
      pad.dataset.held = 'false'
      easeHome()
    }

    pad.addEventListener('pointerdown', onDown)
    pad.addEventListener('pointermove', onMove)
    pad.addEventListener('pointerup', onUp)
    pad.addEventListener('pointercancel', onUp)
    return () => {
      pad.removeEventListener('pointerdown', onDown)
      pad.removeEventListener('pointermove', onMove)
      pad.removeEventListener('pointerup', onUp)
      pad.removeEventListener('pointercancel', onUp)
      if (releaseRef.current !== null) window.clearInterval(releaseRef.current)
    }
  }, [])

  const drive: RoomDriver = useMemo(
    () => (u, frame) => {
      /* le mur se donne son propre tempo : le même temps que celui qui le
         rend (voir `envelope.ts` — deux horloges, et la phrase ne tombe
         jamais) */
      envelope.tick(frame.time)
      sampleMood(cycle, frame.time, room)
      /* the footer sits still: the camera holds its place and only breathes,
         which is what makes the wall read as a surface rather than a journey */
      const camera = frame.camera
      camera.position.set(0, CAM_HEIGHT, CAM_DISTANCE)
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
      /* la longueur d'arc de la bande : c'est elle qui dit au mur où il
         s'arrête, et donc où tombe son raccord (derrière la caméra) */
      u.uWallSpan.value = palette.cell * feed.columns
      /* ---- où tombe la bande d'écrans dans la fenêtre ---------------------
         Le mur est un cylindre centré sur la caméra : à la distance où il se
         trouve, la fenêtre montre `2 · rayon · tan(fov/2)` de haut, soit une
         poignée de rangées de cases dans un pied de page. La bande doit y tenir
         *entièrement* — c'est ce qui décide de sa rangée de départ, et le
         tirage du moment ne fait plus que la déplacer dans la marge. Sans ce
         calage, une prise sur deux est diffusée sous le bord du cadre : le mur
         a l'air de ne rien montrer. */
      const halfRows = (palette.radius * Math.tan((FOV / 2) * (Math.PI / 180))) / palette.cell
      /* le centre du cadre tombe sous l'origine — la caméra vise (0, 0, 0)
         depuis un demi-mètre plus haut qu'elle : la fenêtre penche vers le bas */
      const centreRow = (CAM_HEIGHT - (palette.radius * CAM_HEIGHT) / CAM_DISTANCE) / palette.cell
      const firstRow = Math.ceil(centreRow - halfRows)
      const lastRow = Math.floor(centreRow + halfRows) - 1
      const slide = Math.min(1, Math.max(0, moment ? moment.seed : 0.5))
      /* La bande est ancrée *en bas* du cadre : on ne diffuse que des cases
         qu'on voit, et le fondu se charge du reste vers le haut.

         Elle descend même un peu plus bas que la dernière rangée *entièrement*
         visible : le bas d'un cadre vu de biais est comprimé, donc les rangées
         qui suivent sont encore à l'image, simplement plus serrées. Sans ce
         supplément, le contenu (un sprite, un cartouche) se retrouve au milieu
         du cadre — c'est-à-dire derrière l'emblème, qui est devant. */
      const lowest = lastRow - feed.rows + 1
      u.uScreenFit.value = 1
      /* le décalage se compte en *cases de contenu*, pas en écrans : une rangée
         d'écran, sur une grille fine, ne se verrait pas */
      u.uScreenRow.value = Math.max(firstRow, lowest - (slide > 0.65 ? SCREEN_RES : 0))
      /* sonde de mise au point : `?wall=1` publie l'état du mur dans la page,
         ce qui est la seule façon de voir *quand* il parle et où il se pose */
      if (debug.current) {
        if (firstTick.current < 0) firstTick.current = frame.time
        /* sonde de cadrage : où tombe, en pixels, une colonne d'écran donnée */
        const probes: Record<string, number> = {}
        for (const off of [-200, -160, -108, -80, -48, 0, 48, 80, 108, 160, 200]) {
          const ang = (off * palette.cell) / palette.radius
          const point = new THREE.Vector3(
            Math.sin(ang) * palette.radius,
            0,
            CAM_DISTANCE - Math.cos(ang) * palette.radius,
          )
          point.project(frame.camera)
          probes[String(off)] = Math.round(((point.x + 1) / 2) * frame.size.width)
        }
        ;(window as unknown as Record<string, unknown>).__wall = {
          t: frame.time,
          firstTick: firstTick.current,
          screen: u.uScreen.value,
          row: u.uScreenRow.value,
          rows: feed.rows,
          firstRow,
          lastRow,
          span: u.uWallSpan.value,
          cell: u.uCell.value,
          fov: (frame.camera as { fov?: number }).fov,
          aspect: (frame.camera as { aspect?: number }).aspect,
          probes,
          nonce: moment?.nonce ?? 0,
          startedAt: moment?.startedAt ?? null,
          momentT: moment ? envelope.phase(frame.time) : null,
          beat: feed.beat(),
          grab: { active: pointer.grab.active, x: +pointer.grab.x.toFixed(3), y: +pointer.grab.y.toFixed(3) },
        }
        ;(window as unknown as Record<string, unknown>).__wallFeed = feed.canvas()
      }
      /* Ce que le cadre montre de la bande : le mur est plus large que le
         champ, donc une image diffusée se cadre sur *cette* part.

         Attention, la largeur montrée est une **longueur d'arc** : le mur est
         un cylindre autour de la caméra, et la largeur du champ (2·R·tan(fov/2)
         × le rapport de forme) est la corde, pas l'arc. Confondre les deux
         donnait un cadre 1,6 fois trop large — les figures se plaçaient alors
         comme si on en voyait 300 écrans quand on en voit 190. */
      const aspect = frame.size.width / Math.max(1, frame.size.height)
      const halfFov = Math.atan(aspect * Math.tan((FOV / 2) * (Math.PI / 180)))
      const seen = 2 * palette.radius * halfFov
      const view = Math.min(1, Math.max(0.2, seen / u.uWallSpan.value))
      if (moment) feed.update(moment.word, moment.seed, envelope.phase(frame.time), moment.duration, view)
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
        camera={{ position: [0, CAM_HEIGHT, CAM_DISTANCE], fov: FOV, near: 0.1, far: 90 }}
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

      {/* la prise : une pastille autour de l'emblème, et rien d'autre — c'est
          elle qui laisse la souris et le doigt promener le N */}
      <div
        ref={grabRef}
        className={styles.grab}
        data-held="false"
        style={{ ['--grab-y' as string]: `${emblemCenter * 100}%` }}
        role="presentation"
        aria-hidden="true"
      />

      <div className={`${styles.layer} ${styles.front}`}>
        <Canvas
          dpr={dpr}
          frameloop={active ? 'always' : 'never'}
          gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
          camera={{ position: [0, CAM_HEIGHT, CAM_DISTANCE], fov: FOV, near: 0.1, far: 90 }}
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
     hauteur visible est la même mais la largeur ne l'est pas — d'où ce frein,
     qui empêche un N de prendre toute la bande d'un pied de page mobile. Il
     reste large (0,78 de la largeur) : la marque est le sujet du cadre, sur un
     téléphone comme sur un écran large, elle doit remplir son rôle. */
  const basis = Math.min(height, width * 0.78)
  const size = Math.min(2.1, Math.max(0.4, basis * 0.27 * scale))
  /* Le cadre est centré sur l'origine du monde — `@react-three/fiber` fait
     regarder la caméra vers (0, 0, 0), pas droit devant elle. L'emblème se pose
     donc sur la *fraction de la boîte* demandée par l'hôte, sans cale : c'est
     ce qui l'aligne sur le mot de l'hôte, qui est centré dans la même boîte. */
  const lift = (0.5 - center) * height
  return <Emblem shape={shape} pull={pull} follow={follow} size={size} lift={lift} mood={mood} />
}
