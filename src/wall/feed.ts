import * as THREE from 'three'

/**
 * What the wall shows.
 *
 * This is the whole picture, painted on the CPU into one canvas that a shader
 * samples per cell — which is what lets a *run of cells* carry one big letter,
 * a drawing made of lit squares, a sea crossing the wall, a comic page
 * scrolling screen by screen, or a little figure jumping a gap with something
 * on his heels. A shader could not compose that: it would have one hash per
 * cell and one letter per cell.
 *
 * Two languages live in the same canvas, on purpose:
 *
 * - the **written** one (a word, a drawing) is painted at full canvas
 *   resolution and snaps from take to take: a display that writes holds its
 *   frame;
 * - the **broadcast** one (the sea, the page, the runner) is painted on a grid
 *   of two samples per screen and blown up with smoothing off, so the picture
 *   is carried by the cells, one screen at a time.
 *
 * The canvas stays transparent wherever nothing is being shown, so a cell
 * never lights up "for nothing".
 */

/**
 * Combien d'écrans par « case de dessin ».
 *
 * Le mur se dessine en **cases de contenu** : un sprite fait cinq cases de
 * large, une lettre du cartouche en occupe une, une vague se lit en cases. Et
 * chaque case de contenu est découpée en `SCREEN_RES × SCREEN_RES` écrans.
 *
 * C'est ce qui permet à un pied de page d'avoir un mur d'écrans **fin** — bien
 * plus de pixels, un dessin plus net, plus de choses à montrer dans la même
 * surface — sans que le moindre dessin change : ils sont écrits en cases, le
 * mur les rend en écrans. Passer de 1 à 4 multiplie le nombre d'écrans par 16.
 */
export const SCREEN_RES = 16

/**
 * Combien de *cases de contenu* la bande est large et haute.
 *
 * **Trente de large** — et ce n'est pas un réglage de confort : le mur fait le
 * tour de la salle, donc la bande doit être *plus large que le cadre*. Plus
 * étroite, son raccord tomberait au milieu de l'écran et l'image serait coupée
 * en deux — c'est exactement ce qui faisait qu'une voiture NOCTIS se lisait
 * deux fois, à gauche et à droite du N. Avec trente cases (480 écrans, une
 * soixantaine de degrés de plus que ce que la caméra voit), la jointure tombe
 * **derrière la caméra** : le cadre montre une seule image, entière.
 */
export const DESIGN_COLS = 30
export const DESIGN_ROWS = 6

/** combien d'écrans la bande est large et haute (voir `SCREEN_RES`) */
export const SCREEN_COLS = DESIGN_COLS * SCREEN_RES
export const SCREEN_ROWS = DESIGN_ROWS * SCREEN_RES

/**
 * Un écran, en pixels de canevas. Il n'a pas besoin d'être gros : le mur
 * l'agrandit, et c'est la taille du *canevas* qui fait la netteté du dessin
 * (voir `PX`).
 */
const CELL = 8
/** one cell of *content*, in canvas pixels (a square of `SCREEN_RES` screens) */
const PX = CELL * SCREEN_RES
/** how many times a second the feed is redrawn while a moment is playing */
const FPS = 18
/** what one screen can show of a broadcast picture: 2 × 2 samples */
const SAMPLES = 2
const SW = SCREEN_COLS * SAMPLES
const MOTIF = SW / 2

/**
 * Le **milieu du cadre**, en cases de contenu.
 *
 * Le mur tourne autour de la caméra : ses colonnes se suivent en rond, et la
 * bande est posée pour que sa case du milieu tombe pile au centre de l'écran.
 * Tout ce que le mur écrit ou dessine se compte donc à partir d'ici —
 * `centre(0)` est le milieu du cadre, `centre(-1)` une case à gauche — et la
 * seule jointure de la bande s'en va derrière la caméra, hors champ.
 */
const MID = DESIGN_COLS / 2
const wrapCol = (col: number) => (((col + MID) % DESIGN_COLS) + DESIGN_COLS) % DESIGN_COLS

export type FeedChannel =
  | 'word'
  | 'mark'
  | 'wave'
  | 'page'
  | 'runner'
  | 'mario'
  | 'shapes'
  | 'pac'
  | 'video'
  | 'nevomove'
  | 'wipe'

/**
 * Un extrait à diffuser sur le mur : le fichier, et l'étiquette que les cases
 * écrivent par-dessus — comme un cartouche de télévision.
 */
export type VideoClip = {
  src: string
  /** ce que les cases écrivent pendant la diffusion (le cartouche) */
  label?: string
}

/** what a screen can be painted with: a grey level, or a colour */
export type Ink = number | [number, number, number]

/**
 * a sprite is rows of cells: `#` lit, `.` off, `o` a screen left dark (an eye)
 * — plus, when the subject needs it, a couple of colours (`r` red, `b` blue,
 * `s` skin, `y` yellow). The wall is blue: two drops of colour read louder on
 * it than any amount of grey.
 */
export type Sprite = string[]

export type FeedOptions = {
  /** the channels a moment can play, and their weight (how long they hold) */
  channels?: Partial<Record<FeedChannel, number>>
  /** the run cycle; the last frame is the one used in the air */
  runner?: Sprite[]
  /** what chases him */
  chaser?: Sprite
  /** images played screen by screen (URLs); nothing is required */
  photos?: string[]
  /**
   * Extraits vidéo à passer *sur les cases* : courts (5-8 s), légers, muets.
   * Le mur ne les charge qu'au premier passage — un pied de page qui ne les
   * diffuse pas ne les paie pas.
   */
  videos?: VideoClip[]
  /**
   * Les Nevomon de NevoMove, pour la page de publicité : des images (GIF
   * animés bienvenus) **de la même origine que le site** — une image d'un
   * autre domaine *teinte* le canevas, et la texture WebGL ne se téléverse
   * plus. Recopiez-les chez vous.
   */
  nevomon?: string[]
  /** the font the wall writes in */
  font?: string
  /**
   * Combien de rangées de cases la bande occupe. Six par défaut — la hauteur
   * d'un bandeau de fond. Un pied de page plus haut en demande davantage :
   * c'est ce qui permet aux cases de monter loin dans le fondu tout en gardant
   * ce qui se passe (sprites, mots, images) dans les rangées du bas, celles
   * qu'on voit vraiment.
   */
  rows?: number
}

export type Feed = {
  /** the texture the wall samples — `null` when there is no browser canvas */
  texture: THREE.CanvasTexture | null
  /**
   * Repaint si cette prise n'est pas déjà sur le mur. `view` est la part de la
   * bande que le cadre montre (0 → 1) : c'est ce qui permet à une image — une
   * vidéo, une capture de site — d'être **cadrée sur ce qu'on voit** au lieu
   * d'être étalée sur toute la bande puis recadrée à l'aveugle.
   */
  update: (word: string, seed: number, phase: number, duration?: number, view?: number) => void
  /** pin one channel, for review (`?feed=runner`); `null` lets the takes run */
  pin: (channel: FeedChannel | null) => void
  /** la prise en cours — pour les contrôles (voir `scripts/`) et les tests */
  beat: () => string
  /** le canevas peint — même usage : regarder ce que le mur a vraiment reçu */
  canvas: () => HTMLCanvasElement | null
  columns: number
  rows: number
  dispose: () => void
}

type Beat = { kind: FeedChannel; weight: number }

/** the programmes a moment draws from: three beats each, words are the anchors */
const PROGRAMMES: FeedChannel[][] = [
  /* Les figures passent en deux temps : un mot puis elles, ou elles puis un
     mot. Un sprite qui n'a qu'un tiers du moment se coupe avant qu'on l'ait
     vu courir. */
  ['word', 'mario'],
  ['mario', 'word'],
  ['word', 'pac'],
  ['pac', 'word'],
  ['word', 'shapes'],
  ['shapes', 'word'],
  ['mario', 'shapes'],
  ['pac', 'mario'],
  ['word', 'wipe', 'shapes'],
  ['word', 'wipe', 'mario'],
  ['pac', 'word', 'shapes'],
  ['word', 'mark', 'pac'],
  ['shapes', 'word', 'mario'],
  ['word', 'wave', 'runner'],
  ['word', 'page', 'word'],
  ['runner', 'word', 'page'],
  ['video', 'word'],
  ['word', 'video'],
  ['video', 'shapes'],
  ['video', 'wipe', 'word'],
  ['mario', 'wipe', 'word'],
  ['pac', 'wipe', 'word'],
  ['word', 'wipe', 'wave'],
  /* La page de NevoMove passe **une fois** dans le tour : une publicité qui
     revient toutes les deux prises n'est plus une publicité, c'est une boucle. */
  ['nevomove', 'word'],
]

/** the drawings, as cells: `#` is a lit square, `.` is left alone */
const MARKS: string[][] = [
  ['.##.', '#..#', '#..#', '.##.'],
  ['..#..', '.###.', '#####', '..#..', '..#..'],
  ['..#..', '#####', '..#..'],
  ['#...#', '#...#', '#####', '....#'],
  ['#..#..', '#.#.#.', '#####.'],
  ['.#.#.', '#.#.#', '.#.#.'],
]

/**
 * Les figures de la maison sont des *dessins* (voir plus bas). Un hote qui
 * passe les siennes par `runner` / `chaser` en donne toujours des matrices de
 * cases : elles sont alors agrandies a la taille de l'ecran, et le mur les joue
 * par les memes cases.
 */
/*
 * Une figure est un **dessin fait à la main**, peint une fois pour toutes dans
 * une petite toile à la résolution de l'écran : un pixel du dessin = un écran
 * du mur.
 *
 * C'est la correction de fond de cette passe. Avant, un sprite etait une
 * matrice de cinq cases : un Mario haut de cinq paves, illisible. Maintenant il
 * se dessine sur quarante-quatre ecrans de haut — quarante-quatre pixels de
 * dessin, de quoi poser une casquette, un oeil, une moustache, une salopette et
 * deux chaussures. Le mur, lui, n'a pas change : la figure est posee ecran par
 * ecran, et le joint entre deux ecrans la decoupe comme il decoupe un mot.
 */

export type Figure = {
  /** largeur du dessin, en écrans */
  w: number
  /** hauteur du dessin, en écrans */
  h: number
  /** le dessin, peint une fois pour toutes */
  paint: (g: CanvasRenderingContext2D) => void
}

const RED = '#e5322a'
const SKIN = '#f7c98d'
const DENIM = '#2f5ae0'
const DARK = '#20140d'
const BROWN = '#5b3418'
const GOLD = '#ffd21e'
const VOID = '#0b0a0c'

/** un rectangle, en écrans : l'outil de base de tous les dessins */
const box = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) => {
  g.fillStyle = c
  g.fillRect(x, y, w, h)
}

/**
 * Mario.
 *
 * Trois poses : deux foulees, et la pose en l'air — jambes repliees, bras
 * leve : c'est le saut qui le fait lire. La casquette rouge en haut, la
 * moustache au milieu du visage, la salopette bleue et deux chaussures brunes
 * en bas ; le tout sur 34 x 44 ecrans, soit huit fois plus de dessin qu'avant.
 */
const mario = (pose: 0 | 1 | 2): Figure => ({
  w: 34,
  h: 44,
  paint: (g) => {
    /* casquette : le dome, puis la visiere qui depasse */
    g.fillStyle = RED
    g.beginPath()
    g.arc(17, 12, 10, Math.PI, 0)
    g.fill()
    box(g, 4, 10, 27, 4, RED)
    /* visage, oeil, nez, moustache */
    box(g, 9, 14, 16, 11, SKIN)
    box(g, 17, 16, 4, 6, DARK)
    box(g, 23, 19, 6, 4, SKIN)
    box(g, 9, 22, 14, 4, DARK)
    box(g, 12, 26, 10, 2, SKIN)
    /* torse : la chemise rouge, la salopette et ses deux bretelles */
    box(g, 6, 25, 22, 11, RED)
    box(g, 12, 26, 4, 6, DENIM)
    box(g, 18, 26, 4, 6, DENIM)
    box(g, 9, 30, 16, 9, DENIM)
    box(g, 12, 33, 3, 3, GOLD)
    box(g, 19, 33, 3, 3, GOLD)
    /* bras */
    if (pose === 2) {
      box(g, 1, 17, 5, 7, SKIN)
      box(g, 2, 22, 5, 7, RED)
      box(g, 27, 25, 5, 7, RED)
      box(g, 28, 30, 5, 6, SKIN)
    } else if (pose === 0) {
      box(g, 3, 27, 4, 9, RED)
      box(g, 2, 35, 5, 5, SKIN)
      box(g, 27, 26, 4, 7, RED)
      box(g, 27, 32, 5, 5, SKIN)
    } else {
      box(g, 3, 25, 4, 7, RED)
      box(g, 2, 31, 5, 5, SKIN)
      box(g, 27, 27, 4, 9, RED)
      box(g, 28, 35, 5, 5, SKIN)
    }
    /* jambes et chaussures */
    if (pose === 2) {
      box(g, 11, 38, 6, 4, DENIM)
      box(g, 20, 36, 6, 4, DENIM)
      box(g, 5, 41, 11, 3, BROWN)
      box(g, 18, 39, 11, 3, BROWN)
    } else if (pose === 0) {
      box(g, 11, 38, 5, 4, DENIM)
      box(g, 20, 38, 5, 4, DENIM)
      box(g, 5, 41, 12, 3, BROWN)
      box(g, 19, 41, 12, 3, BROWN)
    } else {
      box(g, 12, 38, 4, 4, DENIM)
      box(g, 19, 38, 4, 4, DENIM)
      box(g, 8, 41, 10, 3, BROWN)
      box(g, 17, 41, 10, 3, BROWN)
    }
  },
})


/**
 * Le coureur et ce qui le suit.
 *
 * Le coureur a garde sa casquette et son echarpe rouges : c'est le meme
 * bonhomme qu'au depart, mais dessine sur 14 x 28 ecrans au lieu de trois
 * cases — on voit enfin ses jambes courir.
 */
const runner = (pose: 0 | 1 | 2): Figure => ({
  w: 14,
  h: 28,
  paint: (g) => {
    box(g, 4, 1, 7, 2, RED)
    box(g, 3, 3, 9, 2, RED)
    box(g, 4, 5, 6, 6, SKIN)
    box(g, 8, 6, 2, 3, VOID)
    box(g, 3, 10, 8, 8, DENIM)
    box(g, 4, 11, 6, 2, RED)
    if (pose === 2) {
      box(g, 1, 7, 2, 6, SKIN)
      box(g, 11, 9, 2, 6, SKIN)
      box(g, 4, 18, 3, 6, DENIM)
      box(g, 8, 18, 3, 6, DENIM)
      box(g, 1, 23, 5, 3, DARK)
      box(g, 9, 23, 5, 3, DARK)
    } else if (pose === 0) {
      box(g, 2, 11, 2, 7, SKIN)
      box(g, 10, 11, 2, 5, SKIN)
      box(g, 4, 18, 3, 7, DENIM)
      box(g, 8, 18, 3, 7, DENIM)
      box(g, 2, 25, 5, 3, DARK)
      box(g, 8, 25, 5, 3, DARK)
    } else {
      box(g, 2, 11, 2, 5, SKIN)
      box(g, 10, 11, 2, 7, SKIN)
      box(g, 3, 18, 3, 7, DENIM)
      box(g, 9, 18, 3, 7, DENIM)
      box(g, 1, 25, 5, 3, DARK)
      box(g, 9, 25, 5, 3, DARK)
    }
  },
})

/** la bete qui le suit : une masse sombre, deux yeux, trois dents */
const chaser: Figure = {
  w: 22,
  h: 16,
  paint: (g) => {
    g.fillStyle = '#241636'
    g.beginPath()
    g.ellipse(11, 9, 10, 7, 0, 0, Math.PI * 2)
    g.fill()
    box(g, 4, 4, 4, 4, VOID)
    box(g, 14, 4, 4, 4, VOID)
    box(g, 5, 5, 2, 2, GOLD)
    box(g, 15, 5, 2, 2, GOLD)
    box(g, 5, 12, 3, 3, '#f2f0e6')
    box(g, 10, 12, 3, 3, '#f2f0e6')
    box(g, 15, 12, 3, 3, '#f2f0e6')
  },
}

/** la piece qu'il attrape en passant */
const coin: Figure = {
  w: 10,
  h: 14,
  paint: (g) => {
    box(g, 2, 0, 6, 14, GOLD)
    box(g, 0, 2, 10, 10, GOLD)
    box(g, 3, 3, 4, 8, '#fff2b0')
    box(g, 4, 5, 2, 4, '#c99a12')
  },
}

/**
 * Le marcheur de la page de publicite : un bonhomme au trait, jaune, qui
 * traverse la bande — dessine lui aussi a la resolution de l'ecran.
 */
const walker = (stride: number): Figure => ({
  w: 20,
  h: 34,
  paint: (g) => {
    g.strokeStyle = GOLD
    g.lineWidth = 2.4
    g.lineCap = 'round'
    g.beginPath()
    g.arc(10, 7, 4.2, 0, Math.PI * 2)
    g.moveTo(10, 11)
    g.lineTo(10, 21)
    g.moveTo(3, 15)
    g.lineTo(17, 15)
    g.moveTo(10, 21)
    g.lineTo(4 + stride * 4, 31)
    g.moveTo(10, 21)
    g.lineTo(16 - stride * 4, 31)
    g.stroke()
  },
})

const FONT_STACK = "'Inter Tight Variable', 'Inter Tight', 'Inter Variable', 'Helvetica Neue', Arial, sans-serif"

/* the comic sheet the page channel falls back to when no photo is supplied */
const PAPER = '#e9e7e0'
const INK = '#08080a'
const TONE = '#b0aea8'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const ramp = (t: number, from: number, to: number) => clamp01((t - from) / Math.max(0.0001, to - from))

/**
 * A tiny deterministic generator: the same seed always paints the same take.
 *
 * Il hache la partie *fractionnaire* du germe, multipliée par 2³² : ajouter un
 * entier au germe (ce que fait chaque prise : `seed + 47`, `seed + 91`…) doit
 * continuer à donner une suite **différente**. L'ancienne version multipliait
 * le germe entier par 9973 avant de le réduire : dès qu'on lui ajoutait 91, la
 * plage de variation tombait à 1 %, et tous les tirages dérivés se
 * ressemblaient — c'est ce qui figeait les programmes et les trajectoires.
 */
function rng(seed: number) {
  let s = Math.floor(Math.abs(seed) * 4294967296) % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 48271) % 2147483647
    return s / 2147483647
  }
}

function shuffled(count: number, seed: number) {
  const order = Array.from({ length: count }, (_, i) => i)
  const next = rng(seed)
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1))
    const swap = order[i]
    order[i] = order[j]
    order[j] = swap
  }
  return order
}

type Rand = () => number

function paintTone(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, density: number, next: Rand) {
  c.fillStyle = TONE
  for (let py = y; py < y + h; py += 2) {
    for (let px = x; px < x + w; px += 2) {
      const d = (px - x) / Math.max(1, w) + (py - y) / Math.max(1, h)
      if (next() < density * (0.3 + d * 0.9)) c.fillRect(px, py, 1, 1)
    }
  }
}

/** a face in close-up: a mass of hair, the light of a cheek, one heavy eye */
function paintFace(c: CanvasRenderingContext2D, w: number, h: number, next: Rand) {
  const fx = w * 0.14
  const fy = 1
  const fw = w * 0.72
  const fh = h - 2
  c.fillStyle = INK
  c.fillRect(Math.round(fx), fy, Math.round(fw), Math.max(3, Math.round(fh * 0.44)))
  for (let i = 0; i < 4; i += 1) {
    const strand = fx + (i / 4) * fw
    c.fillRect(Math.round(strand + 1), Math.round(fy + fh * 0.36), Math.max(1, Math.round(fw * 0.1)), Math.round(fh * 0.22))
  }
  c.fillRect(Math.round(fx + fw * 0.06), Math.round(fy + fh * 0.52), Math.round(fw * 0.4), 2)
  c.fillStyle = PAPER
  c.fillRect(Math.round(fx + fw * 0.12), Math.round(fy + fh * 0.52), Math.round(fw * 0.11), 1)
  c.fillStyle = INK
  c.fillRect(Math.round(fx + fw * 0.22), Math.round(fy + fh * 0.82), Math.round(fw * 0.3), 1)
  paintTone(c, Math.round(fx + fw * 0.55), fy, Math.round(fw * 0.45), Math.round(fh * 0.5), 0.4, next)
}

/** a standing silhouette: head, shoulders, cloak, legs */
function paintFigure(c: CanvasRenderingContext2D, cx: number, top: number, height: number) {
  c.fillStyle = INK
  const head = Math.max(2, height * 0.2)
  const shoulders = Math.max(3, height * 0.32)
  c.fillRect(Math.round(cx - head / 2), Math.round(top), Math.round(head), Math.round(head))
  c.fillRect(Math.round(cx - shoulders / 2), Math.round(top + head), Math.round(shoulders), Math.round(height * 0.34))
  c.fillRect(Math.round(cx - shoulders / 2 - 1), Math.round(top + head + 1), Math.round(shoulders + 2), Math.round(height * 0.2))
  const leg = Math.max(1, shoulders * 0.26)
  c.fillRect(Math.round(cx - shoulders / 2), Math.round(top + height * 0.74), Math.round(leg), Math.round(height * 0.28))
  c.fillRect(Math.round(cx + shoulders / 2 - leg), Math.round(top + height * 0.74), Math.round(leg), Math.round(height * 0.28))
}

/** the world streaking past a figure that does not move */
function paintBurst(c: CanvasRenderingContext2D, w: number, h: number, next: Rand) {
  c.fillStyle = INK
  for (let i = 0; i < 9; i += 1) {
    const row = Math.round((i / 9) * h)
    const len = w * (0.3 + next() * 0.7)
    c.fillRect(Math.round(next() * (w - len)), row, Math.round(len), 1)
  }
  paintTone(c, Math.round(w * 0.55), 0, Math.round(w * 0.45), h, 0.5, next)
  paintFigure(c, w * 0.34, h * 0.14, h * 0.8)
}

/** a range of hills and a low sun, drawn as bars and a disc — never a triangle */
function paintRange(c: CanvasRenderingContext2D, w: number, h: number, next: Rand) {
  c.fillStyle = INK
  c.beginPath()
  c.arc(Math.round(w * 0.62), Math.round(h * 0.36), Math.max(2, h * 0.24), 0, Math.PI * 2)
  c.fill()
  for (let i = 0; i < 8; i += 1) {
    const x = (i / 8) * w
    const bar = h * (0.2 + next() * 0.34)
    c.fillRect(Math.round(x), Math.round(h - bar), 1, Math.round(bar))
  }
  c.fillRect(0, h - 1, w, 1)
  paintTone(c, 0, Math.round(h * 0.6), w, Math.round(h * 0.4), 0.5, next)
}

/** a slash of ink across the band: pure movement, no subject */
function paintSlash(c: CanvasRenderingContext2D, w: number, h: number) {
  c.fillStyle = INK
  for (let i = 0; i < 3; i += 1) {
    const y = (i / 3) * h
    c.beginPath()
    c.moveTo(0, y + h * 0.1)
    c.lineTo(w, y)
    c.lineTo(w, y + h * 0.16)
    c.lineTo(0, y + h * 0.28)
    c.closePath()
    c.fill()
  }
}

/**
 * Four bands of comic page, painted once per seed and then *windowed*: the wall
 * shows one band and the band travels down a couple of samples at a time. That
 * is the whole trick behind an image that scrolls case par case — nothing is
 * animated, the picture is being read in whole screens, which is exactly what a
 * wall of monitors does to a frame.
 */
function paintSheet(seed: number, sh: number): HTMLCanvasElement {
  const sheet = document.createElement('canvas')
  sheet.width = SW
  sheet.height = sh * 4
  const c = sheet.getContext('2d')
  if (!c) return sheet
  const next = rng(seed + 17)
  c.fillStyle = PAPER
  c.fillRect(0, 0, sheet.width, sheet.height)

  for (let band = 0; band < 4; band += 1) {
    const top = band * sh
    const kind = Math.floor(next() * 4)
    const motif = document.createElement('canvas')
    motif.width = MOTIF
    motif.height = sh
    const m = motif.getContext('2d')
    if (!m) continue
    m.fillStyle = PAPER
    m.fillRect(0, 0, MOTIF, sh)
    if (kind === 0) paintFace(m, MOTIF, sh, next)
    else if (kind === 1) paintBurst(m, MOTIF, sh, next)
    else if (kind === 2) paintRange(m, MOTIF, sh, next)
    else paintSlash(m, MOTIF, sh)
    /* the gutter, so the band still reads as pages passing */
    m.fillStyle = INK
    m.fillRect(0, 0, 1, sh)
    /* placed like a strip of wall: once across the seam of the room — which is
       what the camera faces — and once half a turn further round */
    const half = Math.round(MOTIF / 2)
    c.drawImage(motif, half, top)
    c.drawImage(motif, -half, top)
    c.drawImage(motif, Math.round(MOTIF * 1.5), top)
  }

  return sheet
}

export function createFeed(options: FeedOptions = {}): Feed {
  /* le dessin se compte en *cases de contenu*… */
  const columns = DESIGN_COLS
  const rows = Math.max(1, Math.round(options.rows ?? DESIGN_ROWS))
  /* …et le mur en écrans : c'est ce couple que le shader et les dessins
     partagent (voir `SCREEN_RES`) */
  const screenCols = columns * SCREEN_RES
  const screenRows = rows * SCREEN_RES
  const sw = screenCols * SAMPLES
  const sh = screenRows * SAMPLES
  const empty: Feed = {
    texture: null,
    update: () => {},
    pin: () => {},
    beat: () => '',
    canvas: () => null,
    columns: screenCols,
    rows: screenRows,
    dispose: () => {},
  }
  if (typeof document === 'undefined') return empty

  const canvas = document.createElement('canvas')
  canvas.width = screenCols * CELL
  canvas.height = screenRows * CELL
  const ctx = canvas.getContext('2d')
  if (!ctx) return empty

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false

  /* the broadcast buffer: one screen is `SAMPLES` × `SAMPLES` pixels here, and
     it is blown up with smoothing off, so a picture is carried by the cells */
  const buffer = document.createElement('canvas')
  buffer.width = sw
  buffer.height = sh
  const bctx = buffer.getContext('2d')
  if (!bctx) return empty

  const sheets = new Map<number, HTMLCanvasElement>()
  const sheetFor = (seed: number) => {
    const key = Math.round(seed * 1000)
    let sheet = sheets.get(key)
    if (!sheet) {
      sheet = paintSheet(seed, sh)
      sheets.set(key, sheet)
      if (sheets.size > 3) sheets.delete(sheets.keys().next().value as number)
    }
    return sheet
  }

  /**
   * Les images que l'hôte confie au mur — captures de sites et Nevomon.
   *
   * Elles sont chargées **à la première prise qui les demande**, jamais avec le
   * composant : le mur se monte pour un pied de page, il n'a pas à télécharger
   * des images qu'il ne diffusera peut-être jamais. Une image pas encore prête
   * laisse simplement sa place (le canal dessine alors ce qu'il sait faire).
   */
  const loader = (urls: string[]) => {
    const cache: Array<HTMLImageElement | null> = urls.map(() => null)
    return (index: number) => {
      const url = urls[index]
      if (!url || typeof Image === 'undefined') return null
      let img = cache[index]
      if (!img) {
        img = new Image()
        img.decoding = 'async'
        img.src = url
        cache[index] = img
      }
      return img
    }
  }
  const photoFor = loader(options.photos ?? [])
  const nevomonFor = loader(options.nevomon ?? [])
  const photoCount = (options.photos ?? []).length
  const nevomonCount = (options.nevomon ?? []).length

  /**
   * Une matrice de cases donnée par l'hôte (`runner` / `chaser`) est agrandie
   * à la résolution de l'écran : une case du dessin d'origine vaut six écrans
   * de large et de haut, ce qui lui donne la même matière qu'une figure de la
   * maison sans lui demander d'être redessinée.
   */
  const spriteFigure = (sprite: Sprite, scale = 6): Figure => ({
    w: Math.max(...sprite.map((line) => Array.from(line).length)) * scale,
    h: sprite.length * scale,
    paint: (g) => {
      sprite.forEach((line, r) => {
        Array.from(line).forEach((char, c) => {
          if (char === '.') return
          const ink = SPRITE_INK[char] ?? 0.95
          g.fillStyle =
            typeof ink === 'number'
              ? `rgb(${Math.round(ink * 255)}, ${Math.round(ink * 255)}, ${Math.round(ink * 255)})`
              : `rgb(${Math.round(ink[0] * 255)}, ${Math.round(ink[1] * 255)}, ${Math.round(ink[2] * 255)})`
          g.fillRect(c * scale, r * scale, scale, scale)
        })
      })
    },
  })


  /* Les coordonnées du dessin sont des **cases de contenu** : la conversion
     vers les écrans se fait ici, et nulle part ailleurs. `x`/`y` donnent le
     coin haut-gauche d'une case, `PX` sa taille en pixels de canevas. */
  const x = (col: number) => col * PX
  const y = (row: number) => row * PX

  /**
   * Une case de contenu allumée — c'est-à-dire `SCREEN_RES × SCREEN_RES`
   * écrans.
   *
   * On la remplit d'un seul aplat : le **joint noir entre deux écrans n'est pas
   * dessiné ici**, c'est la salle qui le pose (`screenJoint` dans `Room.tsx`),
   * écran par écran, sur le mur lui-même. Le refaire dans le canevas serait
   * payer deux fois la même chose — et c'est ce qui rendait une grille fine
   * hors de prix.
   */
  const screen = (col: number, row: number, glass = '#0c0c11') => {
    const cc = wrapCol(col)
    ctx.fillStyle = glass
    ctx.fillRect(cc * PX, row * PX, PX, PX)
  }

  /** a lit square inside one screen (the drawings are made of these) */
  const block = (col: number, row: number) => {
    const cc = wrapCol(col)
    screen(cc, row)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x(cc) + PX * 0.15, y(row) + PX * 0.15, PX * 0.7, PX * 0.7)
  }

  /* ---- the broadcast: one picture, carried by the cells ----------------- */
  const broadcast = (draw: () => void) => {
    bctx.clearRect(0, 0, sw, sh)
    draw()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(buffer, 0, 0, sw, sh, 0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingEnabled = true
  }

  /** la colonne (d'écran) du milieu du cadre */
  const middle = screenCols / 2
  const screenCol = (col: number) => (((col + middle) % screenCols) + screenCols) % screenCols

  /**
   * Ce que le cadre montre, en écrans.
   *
   * Le mur est large (trente cases) et le cadre n'en montre qu'une douzaine :
   * une figure ou une vague qui se compte sur toute la bande se retrouve donc
   * jouée pour les deux tiers hors champ. Tout ce qui doit être *vu* se compte
   * ici, sur la largeur montrée — `seenAt(0.5)` est le bord droit du cadre,
   * `seenAt(-0.5)` son bord gauche — et suit la forme de la fenêtre.
   */
  const seenCols = () => Math.max(48, Math.round(screenCols * frameSpan))
  const seenAt = (frac: number) => Math.round(seenCols() * frac)

  /**
   * Le **pixel du mur**, pour tout ce qui est diffusé : **un écran**.
   *
   * C'est la finesse du mur lui-même. Les dessins de diffusion (la mer, le sol,
   * les figures) se comptent donc en écrans, pas en cases — un sprite dessiné
   * sur quarante écrans de haut montre quarante fois plus de chose qu'avant.
   */
  const plot = (col: number, row: number, ink: Ink, alpha = 1) => {
    const cc = screenCol(col)
    const [r, g, b] = typeof ink === 'number' ? [ink, ink, ink] : ink
    bctx.fillStyle = `rgba(${Math.round(clamp01(r) * 255)}, ${Math.round(clamp01(g) * 255)}, ${Math.round(clamp01(b) * 255)}, ${alpha})`
    bctx.fillRect(cc * SAMPLES, row * SAMPLES, SAMPLES, SAMPLES)
  }

  /**
   * Un aplat de plusieurs écrans d'un coup : c'est l'outil des grands dessins.
   * Une barre par colonne d'écran suffit pour une mer ou un sol — 480
   * rectangles par image au lieu de 46 000.
   */
  const band = (col: number, row: number, w: number, h: number, ink: Ink, alpha = 1) => {
    const [r, g, b] = typeof ink === 'number' ? [ink, ink, ink] : ink
    bctx.fillStyle = `rgba(${Math.round(clamp01(r) * 255)}, ${Math.round(clamp01(g) * 255)}, ${Math.round(clamp01(b) * 255)}, ${alpha})`
    const cols = Math.max(1, Math.round(w))
    const tall = Math.max(1, Math.round(h))
    const x0 = screenCol(col)
    bctx.fillRect(x0 * SAMPLES, row * SAMPLES, cols * SAMPLES, tall * SAMPLES)
    if (x0 + cols > screenCols) {
      bctx.fillRect((x0 - screenCols) * SAMPLES, row * SAMPLES, cols * SAMPLES, tall * SAMPLES)
    }
  }

  /** the inks a sprite may be written with (see `Sprite`) */
  const SPRITE_INK: Record<string, Ink> = {
    '#': 0.95,
    o: 0.06,
    /* les couleurs des figures : peau, casquette rouge, salopette bleue,
       pièce jaune, chaussures brunes. Elles sont *voulues* — un mur bleu qui
       montre un Mario gris ne montre pas Mario. */
    s: [0.99, 0.78, 0.55],
    r: [0.97, 0.16, 0.13],
    b: [0.13, 0.32, 0.95],
    y: [1, 0.85, 0.16],
    k: [0.36, 0.2, 0.1],
  }

  /** les figures du mur : les notres, ou celles que l'hote a donnees */
  const heroRun: Figure[] = options.runner
    ? options.runner.map((sprite) => spriteFigure(sprite))
    : [runner(0), runner(1), runner(2)]
  const heroAir: Figure = options.runner ? heroRun[heroRun.length - 1] : runner(2)
  const villain: Figure = options.chaser ? spriteFigure(options.chaser) : chaser

  /* ---- les figures ------------------------------------------------------ */

  /** le cache des dessins : une figure n'est peinte qu'une fois */
  const drawn = new Map<string, HTMLCanvasElement>()
  const art = (key: string, make: () => Figure) => {
    let sheet = drawn.get(key)
    if (!sheet) {
      const fig = make()
      sheet = document.createElement('canvas')
      sheet.width = fig.w
      sheet.height = fig.h
      const g = sheet.getContext('2d')
      if (g) fig.paint(g)
      drawn.set(key, sheet)
    }
    return sheet
  }

  /**
   * Pose une figure sur le mur **écran par écran** : un pixel du dessin allume
   * un écran, et rien n'est posé derrière — un Pac-Man, comme un Nevomon
   * transparent, laisse le mur vivre sous lui.
   *
   * `screenX` et `screenY` sont des écrans : l'horizontale se compte depuis le
   * milieu du cadre, la verticale depuis le haut de la bande.
   */
  const place = (sheet: HTMLCanvasElement, screenX: number, screenY: number, into: 'picture' | 'canvas') => {
    const target = into === 'picture' ? bctx : ctx
    const unit = into === 'picture' ? SAMPLES : CELL
    const span = into === 'picture' ? sw : canvas.width
    const w = sheet.width * unit
    const h = sheet.height * unit
    const x0 = span / 2 + Math.round(screenX) * unit
    const y0 = Math.round(screenY) * unit
    target.imageSmoothingEnabled = false
    target.drawImage(sheet, x0, y0, w, h)
    if (x0 + w > span) target.drawImage(sheet, x0 - span, y0, w, h)
    if (x0 < 0) target.drawImage(sheet, x0 + span, y0, w, h)
    target.imageSmoothingEnabled = true
  }

  /* ---- the sea ---------------------------------------------------------- */
  /** la hauteur de la bande, en écrans : la mer se dessine à cette finesse */
  const bandRows = rows * SCREEN_RES
  /**
   * La rangée d'écrans qui sert de sol aux figures : vingt écrans au-dessus du
   * bas de la bande. Le pied de page éclaircit ses derniers écrans (le voile
   * qui garde la barre légale lisible) : un sol posé plus bas s'y effacerait,
   * et un Mario dont on ne voit pas les pieds ne court pas, il flotte.
   */
  const floorRow = bandRows - 20

  /**
   * La mer, en **colonnes d'écran** : une barre verticale par colonne, du haut
   * de la vague au bas de la bande. L'écume se lit donc à la finesse du mur —
   * seize fois plus finement qu'avant, pour le même nombre de rectangles.
   */
  const drawWave = (local: number, seed: number) => {
    const next = rng(seed + 3)
    const run = local * 1.6
    const breakAt = ((run * 0.6 + next() * 0.25) % 1.2) - 0.1
    for (let col = -middle; col < middle; col += 1) {
      /* le profil se lit sur ce qu'on voit : deux vagues et demie dans le
         cadre, pas dans la bande entière */
      const p = (col - seenAt(-0.5) + 0.5) / Math.max(1, seenCols())
      /* one long swell and a half across the wall: the eye reads a surface
         travelling, which a short wavelength turns back into a texture */
      const phase = p * 2.4 - run * 3.2 + seed * 6.2831
      let surface = 0.44 + 0.16 * Math.sin(phase) + 0.07 * Math.sin(phase * 2.9 + 1.1)
      const swell = Math.exp(-Math.pow((p - breakAt) * 3.6, 2)) * 0.36
      surface += swell
      const top = Math.round(surface * bandRows)
      if (top >= bandRows) continue
      const grain = rng(seed + col * 3.1 + Math.round(run * 30) * 5.7)()
      /* l'embrun : deux écrans au-dessus de la crête, par plaques */
      if (swell > 0.2 && rng(seed + col * 7.3 + Math.round(run * 30))() > 0.72) {
        plot(col, Math.max(0, top - 2), 0.68 + grain * 0.2, 0.9)
      }
      /* la crête, blanche, puis l'eau qui s'assombrit en descendant */
      band(col, top, 1, 1, 0.88 + grain * 0.12)
      const depth = bandRows - top - 1
      const slabs = 5
      for (let k = 0; k < slabs; k += 1) {
        const from = top + 1 + Math.floor((depth * k) / slabs)
        const tall = Math.floor((depth * (k + 1)) / slabs) - Math.floor((depth * k) / slabs)
        if (tall <= 0) continue
        /* the body of the water is *lit*: on a black wall, dark water is simply
           a hole in the wall, and the swell has to be read through it */
        const shade = Math.max(0, 1 - (k / slabs) * 1.4)
        band(col, from, 1, tall, 0.2 + shade * 0.5 + grain * 0.08)
      }
    }
  }

  /**
   * La largeur utile de la bande, en pixels du tableau : c'est la part que le
   * cadre montre vraiment. Le mur est plus large que le champ (c'est ce qui
   * évite la coupure au milieu de l'écran), donc une image posée sur toute la
   * bande serait rognée deux fois pour rien. On la cadre donc sur cette part —
   * et elle remplit le cadre, entière, d'un bord à l'autre.
   */
  const viewWidth = () => Math.round(sw * frameSpan)

  /* ---- the page --------------------------------------------------------- */
  const drawPage = (local: number, seed: number) => {
    /* la première image déjà chargée ; sinon on commence à charger la suivante
       et on dessine la planche de bande dessinée en attendant */
    let photo: HTMLImageElement | null = null
    for (let index = 0; index < photoCount; index += 1) {
      const img = photoFor(index)
      if (img && img.naturalWidth > 0) {
        photo = img
        break
      }
    }
    if (!photo && photoCount) photoFor(Math.floor(rng(seed + 5)() * photoCount))
    if (photo) {
      const wide = viewWidth()
      const scale = wide / photo.naturalWidth
      const bandH = sh / scale
      const maxY = Math.max(0, photo.naturalHeight - bandH)
      const steps = Math.max(1, Math.floor(maxY / SAMPLES))
      const sy = Math.min(maxY, Math.floor(local * steps) * SAMPLES)
      bctx.imageSmoothingEnabled = true
      bctx.drawImage(photo, 0, sy, photo.naturalWidth, bandH, (sw - wide) / 2, 0, wide, sh)
      return
    }
    const sheet = sheetFor(seed)
    const maxY = Math.max(0, sheet.height - sh)
    const steps = Math.max(1, Math.floor(maxY / SAMPLES))
    const sy = Math.min(maxY, Math.floor(local * steps * 0.86) * SAMPLES)
    bctx.imageSmoothingEnabled = false
    const wide = viewWidth()
    bctx.drawImage(sheet, (sw - wide) / 2, sy, wide, sh, (sw - wide) / 2, 0, wide, sh)
  }

  /* ---- la vidéo --------------------------------------------------------- */
  /**
   * Un extrait joué *sur les cases*.
   *
   * Le mur ne pose pas une vidéo devant lui : il la diffuse, une case après
   * l'autre, comme une régie qui bascule ses moniteurs sur une source. D'où
   * les deux précautions qui comptent : la vidéo est **muette** (elle n'a pas
   * la parole dans un pied de page), et elle n'est **créée qu'au premier
   * passage** — un visiteur qui ne descend pas ne télécharge rien.
   */
  const clips = (options.videos ?? []).map((clip) => ({
    ...clip,
    video: null as HTMLVideoElement | null,
  }))
  let playingClip: HTMLVideoElement | null = null
  let clipKey = ''
  let clipUsed = false

  const clipFor = (seed: number) => clips[Math.floor(rng(seed + 71)() * clips.length) % clips.length]

  /**
   * La mire : ce que le mur montre le temps qu'un extrait se charge.
   *
   * Sans elle, la première prise vidéo était un trou : dix secondes de mur vide
   * parce que le fichier n'était pas encore arrivé. Une mire de régie — des
   * barres et une barre de balayage — dit la même chose en montrant quelque
   * chose.
   */
  const drawTestCard = (local: number) => {
    const wide = viewWidth()
    const left = (sw - wide) / 2
    const bars = 12
    const step = Math.max(1, Math.round(wide / bars))
    for (let i = 0; i < bars; i += 1) {
      bctx.fillStyle = `rgba(255, 255, 255, ${0.05 + (i % 3) * 0.045})`
      bctx.fillRect(left + i * step, 0, step, sh)
    }
    const sweep = left + (((local * 1.6) % 1) * wide)
    bctx.fillStyle = 'rgba(255, 255, 255, 0.22)'
    bctx.fillRect(Math.round(sweep) - 5, 0, 10, sh)
  }

  const drawVideoFrame = (seed: number, seconds: number, local: number) => {
    const clip = clipFor(seed)
    if (!clip) return
    if (!clip.video) {
      const video = document.createElement('video')
      video.src = clip.src
      video.muted = true
      video.playsInline = true
      /* **jamais en boucle** : un extrait se termine, et c'est la prise qui
         s'arrête avec lui (voir le réglage de vitesse plus bas). */
      video.loop = false
      video.preload = 'auto'
      video.setAttribute('muted', '')
      clip.video = video
    }
    const video = clip.video
    if (clip.src !== clipKey) {
      clipKey = clip.src
      video.currentTime = 0
      void video.play().catch(() => {})
    }
    /* L'extrait se termine **juste avant** que la prise change : on lui donne
       la durée exacte du temps qui lui reste, au ralenti ou en accéléré selon
       ce qu'il faut. C'est ce qui fait qu'on voit la fin du plan — la voiture
       qui se pose — et pas un raccord au milieu. */
    if (Number.isFinite(video.duration) && video.duration > 1 && seconds > 1) {
      const rate = Math.min(1.4, Math.max(0.55, video.duration / (seconds - 0.45)))
      if (Math.abs(video.playbackRate - rate) > 0.01) video.playbackRate = rate
    }
    playingClip = video
    clipUsed = true
    if (video.readyState < 2 || !video.videoWidth) {
      drawTestCard(local)
      return
    }
    const wide = viewWidth()
    const left = (sw - wide) / 2
    /* la vidéo *couvre* ce qu'on voit : un mur d'écrans ne montre pas de bords
       noirs, il recadre */
    const scale = Math.max(wide / video.videoWidth, sh / video.videoHeight)
    const w = video.videoWidth * scale
    const h = video.videoHeight * scale
    bctx.imageSmoothingEnabled = true
    bctx.drawImage(video, left + (wide - w) / 2, (sh - h) / 2, w, h)
    bctx.imageSmoothingEnabled = false
    /* un peu de grain par-dessus : la vidéo doit avoir traversé les écrans,
       pas être posée dessus */
    const next = rng(seed + 29)
    for (let y = 0; y < sh; y += 2) {
      for (let x = left; x < left + wide; x += 2) {
        if (next() > 0.06) continue
        bctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
        bctx.fillRect(x, y, 1, 1)
      }
    }
  }

  /* ---- les figures en scène --------------------------------------------- */
  const heroArt = heroRun.map((fig, index) => art(`hero${index}`, () => fig))
  const airArt = art('heroAir', () => heroAir)
  const villainArt = art('villain', () => villain)
  const marioArt = [art('mario0', () => mario(0)), art('mario1', () => mario(1)), art('marioAir', () => mario(2))]
  const coinArt = art('coin', () => coin)
  const walkRightArt = art('walkRight', () => walker(1))
  const walkLeftArt = art('walkLeft', () => walker(-1))

  /* ---- the runner ------------------------------------------------------- */
  /**
   * Le coureur et sa bete, **a la resolution de l'ecran**.
   *
   * Il court au milieu du cadre — le raccord du mur n'y passe plus (voir
   * `DESIGN_COLS`) — sur un sol de dalles qui defile sous lui, et saute les
   * trois crevasses qui reviennent.
   */
  const drawRun = (local: number) => {
    /* le sol se tient *au-dessus* du bas de la bande : le pied de page pose un
       voile clair sur ses derniers écrans, et un sol qui s'y enfonce disparait */
    const floor = floorRow
    const travel = Math.floor(local * 96)
    const gapA = seenAt(0.5) + 30 - travel
    const inGap = (col: number) => [gapA, gapA + 150, gapA - 150].some((gap) => Math.abs(col - gap) < 9)
    for (let col = -middle; col < middle; col += 1) {
      const mark = screenCol(col)
      if (inGap(col)) continue
      band(col, floor, 1, 2, 0.28 + ((mark + travel) % 3 === 0 ? 0.12 : 0))
      if ((mark + travel) % 5 === 0) plot(col, floor + 2, 0.14)
    }

    /* il court a gauche du milieu du cadre, et sa bete le suit de pres (assez
       pres pour qu'on les voie tous les deux dans le champ) */
    const hereX = seenAt(-0.24)
    const distanceToGap = gapA - hereX
    const jump = distanceToGap > -4 && distanceToGap < 20 ? Math.sin(((20 - distanceToGap) / 24) * Math.PI) : 0
    const lift = Math.round(jump * 26)
    const frame = heroArt[Math.floor(local * 26) % heroArt.length] ?? heroArt[0]
    const sheet = lift > 0 ? airArt : frame
    place(sheet, hereX, floor - sheet.height - lift, 'picture')
    const hop = distanceToGap > 0 && distanceToGap < 26 ? Math.round(jump * 16) : 0
    place(villainArt, hereX - Math.round(seenCols() * 0.18), floor - villainArt.height - hop, 'picture')
  }

  /* ---- Mario ------------------------------------------------------------ */
  /**
   * Il court sur place, le sol défile sous lui, et deux fois par moment il
   * saute chercher la pièce. Le sprite est *porté par les cases* comme le
   * coureur : c'est le mur qui montre quelque chose, pas une image posée
   * dessus.
   *
   * Il court *à côté du milieu du cadre* : un pied de page met son mot de
   * marque au centre de la bande, et un sprite centré passerait dessous.
   */
  const drawMario = (local: number, seed: number) => {
    const floor = floorRow
    const travel = Math.floor(local * 62)
    /* le sol : des briques de seize écrans, deux teintes, qui passent sous ses
       pieds — et une marche d'écart toutes les deux briques */
    for (let col = -middle; col < middle; col += 1) {
      const step = Math.floor((screenCol(col) + travel) / 16)
      const phase = ((step % 3) + 3) % 3
      if (phase > 1) continue
      band(col, floor, 1, 2, phase === 0 ? [0.62, 0.36, 0.24] : [0.34, 0.2, 0.14])
    }

    /* deux sauts par moment : il monte, il touche la pièce, il retombe */
    const beat = (local * 2 + seed * 0.31) % 1
    const air = beat < 0.5 ? Math.sin((beat / 0.5) * Math.PI) : 0
    /* un saut *court* : au-delà d'une dizaine d'écrans, sa casquette entre dans
       le fondu du haut et on ne le voit plus sauter, on le voit disparaître */
    const lift = Math.round(air * 13)
    const sheet = air > 0.02 ? marioArt[2] : marioArt[Math.floor(local * 16) % 2]

    /* Il court **juste à droite du N**, dans le bas de la bande : au milieu, il
       passait derrière l'emblème de verre — on voyait une casquette et deux
       chaussures de part et d'autre du N. La pièce tient au-dessus de sa tête
       et s'éteint le temps qu'il la prenne. */
    const x0 = seenAt(0.2) - Math.round(sheet.width / 2)
    const taken = beat > 0.36 && beat < 0.5
    const head = floor + 2 - sheet.height - lift
    /* la pièce flotte à hauteur fixe, devant lui : elle ne monte pas avec ses
       sauts, sinon elle finit par le quitter par le haut du cadre */
    if (!taken) place(coinArt, x0 + sheet.width + 10, floor - 34, 'picture')
    place(sheet, x0, head, 'picture')
  }

  /* ---- the written channels -------------------------------------------- */

  /**
   * Une case : son verre noir, et ce qu'on dessine dessus. Le dessin est
   * rogné à la case — sur un mur d'écrans, rien ne déborde d'un écran sur le
   * voisin, et c'est ce qui fait qu'une forme *traverse* le mur au lieu de
   * flotter devant.
   */
  const inCell = (
    col: number,
    row: number,
    paint: (g: CanvasRenderingContext2D, gx: number, gy: number) => void,
    glass = '#0c0c11',
  ) => {
    const cc = wrapCol(col)
    screen(cc, row, glass)
    ctx.save()
    ctx.beginPath()
    ctx.rect(x(cc), y(row), PX, PX)
    ctx.clip()
    paint(ctx, x(cc), y(row))
    ctx.restore()
  }

  /**
   * Un morceau de forme posé quelque part sur la bande, en coordonnées de
   * cases (la colonne et la rangée, fractionnaires) : la forme est reposée dans
   * chaque case qu'elle traverse, et le rognage garde la part de chaque écran.
   * C'est ce qui fait qu'une forme peut passer le raccord du mur sans se
   * casser, et qu'un sprite peut aller dans n'importe quelle direction.
   */
  const stamp = (
    cellX: number,
    cellY: number,
    half: number,
    paint: (g: CanvasRenderingContext2D, ox: number, oy: number) => void,
  ) => {
    /* `cellX` se compte depuis le **milieu du cadre** : la colonne du milieu de
       la bande est `MID` (voir `centre`) */
    const cx = (cellX + MID) * PX
    const cy = cellY * PX
    for (let k = Math.floor(cellY - half) - 1; k <= Math.ceil(cellY + half) + 1; k += 1) {
      if (Math.abs(cellY - (k + 0.5)) > half + 0.5) continue
      for (let j = Math.floor(cellX - half) - 1; j <= Math.ceil(cellX + half) + 1; j += 1) {
        /* une case ne s'allume que si la forme la traverse vraiment : sans ce
           test, le mur montrerait des écrans noirs et vides autour d'elle */
        if (Math.abs(cellX - (j + 0.5)) > half + 0.5) continue
        const cc = wrapCol(j)
        /* `dx` recale le dessin quand la case a fait le tour de la bande */
        const dx = (cc - MID - j) * PX
        ctx.save()
        ctx.beginPath()
        ctx.rect(x(cc), y(k), PX, PX)
        ctx.clip()
        paint(ctx, cx + dx, cy)
        ctx.restore()
      }
    }
  }

  /** un motif de case : le triangle, le rond, la croix */
  type Motif = 'triangle' | 'ring' | 'cross'

  const paintMotif = (
    g: CanvasRenderingContext2D,
    gx: number,
    gy: number,
    radius: number,
    motif: Motif,
    alpha: number,
    ink: string,
  ) => {
    if (alpha <= 0.01) return
    g.globalAlpha = alpha
    g.fillStyle = ink
    g.strokeStyle = ink
    if (motif === 'triangle') {
      g.beginPath()
      g.moveTo(gx + PX / 2, gy + PX / 2 - radius * 1.15)
      g.lineTo(gx + PX / 2 + radius, gy + PX / 2 + radius * 0.82)
      g.lineTo(gx + PX / 2 - radius, gy + PX / 2 + radius * 0.82)
      g.closePath()
      g.fill()
    } else if (motif === 'ring') {
      g.lineWidth = PX * 0.13
      g.beginPath()
      g.arc(gx + PX / 2, gy + PX / 2, radius * 0.86, 0, Math.PI * 2)
      g.stroke()
    } else {
      /* la croix : deux barres franches, comme au morpion */
      g.lineWidth = PX * 0.15
      g.lineCap = 'round'
      const arm = radius * 0.78
      g.beginPath()
      g.moveTo(gx + PX / 2 - arm, gy + PX / 2 - arm)
      g.lineTo(gx + PX / 2 + arm, gy + PX / 2 + arm)
      g.moveTo(gx + PX / 2 + arm, gy + PX / 2 - arm)
      g.lineTo(gx + PX / 2 - arm, gy + PX / 2 + arm)
      g.stroke()
    }
    g.globalAlpha = 1
  }

  /**
   * Les motifs, et leurs métamorphoses.
   *
   * Toutes les autres cases s'allument *en même temps* — c'est le « d'un coup »
   * de la demande, et c'est ce qui donne au mur l'air de se lever. Chaque case
   * porte une forme qui monte dans sa propre case en un dixième de seconde,
   * tient trois secondes, puis la lumière devient dégressive et la forme se
   * change : triangle → rond, rond → croix, croix → triangle. Une prise sur
   * trois, le damier devient un **morpion** : des ronds et des croix alternés.
   */
  const drawShapes = (local: number, seed: number) => {
    const rise = clamp01(local / 0.06)
    const ease = rise * rise * (3 - 2 * rise)
    /* la forme tient trois secondes (sur un moment de sept), puis laisse la
       place à la suivante */
    const morph = clamp01((local - 0.42) / 0.22)
    const bright = clamp01(1 - ramp(local, 0.42, 1) * 0.72)
    const next = rng(seed)
    const pick = Math.floor(rng(seed + 3)() * 3) % 3
    const from: Motif = (['triangle', 'ring', 'cross'] as Motif[])[pick]
    const to: Motif = from === 'triangle' ? 'ring' : from === 'ring' ? 'cross' : 'triangle'
    const morpion = rng(seed + 7)() > 0.66

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        /* une case sur deux */
        if ((col + row) % 2 !== 0) continue
        /* un rien d'écart entre les cases : le mur se lève, il ne clignote pas */
        const k = ease * (1 - next() * 0.12)
        const radius = PX * 0.3
        const start: Motif = morpion ? ((col + row) % 4 === 0 ? 'cross' : 'ring') : from
        const end: Motif = morpion ? (start === 'cross' ? 'ring' : 'cross') : to
        inCell(col, row, (g, gx, gy) => {
          /* la forme monte dans sa case pendant la première seconde */
          const climb = (1 - k) * PX * 0.34
          g.save()
          g.translate(0, climb)
          paintMotif(g, gx, gy, radius, start, bright * (1 - morph), '#ffffff')
          paintMotif(g, gx, gy, radius, end, bright * morph, '#cfe4ff')
          g.restore()
        })
      }
    }
  }

  /**
   * Les transitions.
   *
   * Six gestes — damier, tornade, volet, diagonale, iris, pluie — tires au sort
   * a chaque prise. C'est ce qui separe deux tableaux : le mur ne change pas de
   * sujet en douce, il *bascule*, case par case, comme une regie qui reprend
   * ses moniteurs. Le damier est celui du milieu : deux familles de cases, l'une
   * apres l'autre, de gauche a droite.
   */
  /** les transitions que le mur connait */
  const WIPES = ['damier', 'tornade', 'volet', 'diagonale', 'iris', 'pluie'] as const
  type Wipe = (typeof WIPES)[number]

  /**
   * Le retard d'une case : c'est lui qui dessine le geste. Tous les styles
   * partagent la meme mecanique — une case s'allume, tient, s'eteint — et ne
   * different que par l'ordre dans lequel elles y passent.
   */
  const wipeDelay = (kind: Wipe, col: number, row: number, seed: number) => {
    /* le geste se lit sur la largeur montrée (voir `seenCols`) : la colonne de
       contenu redevient des écrans, puis se rapporte au cadre */
    const screen = (col + MID) * SCREEN_RES
    const u = (screen - seenAt(-0.5)) / Math.max(1, seenCols())
    const v = (row + 0.5) / rows
    if (kind === 'damier') return ((col + row) % 2 === 0 ? 0 : 0.3) + u * 0.34
    if (kind === 'volet') return v * 0.18 + u * 0.5
    if (kind === 'diagonale') return ((u + v * 0.7) / 1.7) * 0.62
    if (kind === 'iris') return Math.hypot(u - 0.5, v - 0.5) * 0.95
    if (kind === 'tornade') {
      const angle = Math.atan2(v - 0.5, (u - 0.5) * 2.4)
      const radius = Math.hypot(u - 0.5, v - 0.5) * 1.4
      return ((angle + Math.PI) / (Math.PI * 2)) * 0.42 + radius * 0.4
    }
    /* la pluie : un ordre tire au sort, mais stable pour la prise */
    const h = Math.abs(Math.sin(col * 12.9898 + row * 78.233 + seed * 31.7) * 43758.5453) % 1
    return h * 0.58 + v * 0.12
  }

  const drawWipe = (local: number, seed: number) => {
    const kind = WIPES[Math.floor(rng(seed + 41)() * WIPES.length) % WIPES.length]
    const next = rng(seed + 23)
    for (let row = 0; row < rows; row += 1) {
      for (let col = -MID; col < MID; col += 1) {
        const delay = wipeDelay(kind, col, row, seed)
        const rise = ramp(local, delay, delay + 0.2)
        const gone = 1 - ramp(local, 0.7 + delay * 0.3, 0.97)
        const alpha = rise * gone
        if (alpha <= 0.02) continue
        const inset = PX * (0.1 + (1 - rise) * 0.24)
        inCell(col, row, (g, gx, gy) => {
          g.globalAlpha = alpha * (0.6 + next() * 0.4)
          g.fillStyle = kind === 'tornade' ? '#cfe4ff' : '#ffffff'
          if (kind === 'tornade') {
            /* la tornade : le carre tourne dans sa case en montant */
            g.translate(gx + PX / 2, gy + PX / 2)
            g.rotate(delay * 7 + local * 4)
            g.translate(-PX / 2, -PX / 2)
            g.fillRect(inset, inset, PX - inset * 2, PX - inset * 2)
          } else {
            g.fillRect(gx + inset, gy + inset, PX - inset * 2, PX - inset * 2)
          }
          g.globalAlpha = 1
        }, '#0e1730')
      }
    }
  }

  /**
   * Pac poursuit **un seul** rond. Le rond garde toujours un peu d'avance, il
   * frétille sur le côté quand on l'approche, et il file pour de bon à la fin —
   * c'est toute la saynète : on n'attrape pas le rond.
   *
   * Sa trajectoire change à chaque prise, et franchement : au ras du bas, à
   * contresens, en diagonale depuis un angle, ou en deux temps (une descente
   * au milieu, puis une course sur le côté). La bouche claque dans le sens de
   * la marche.
   */
  const drawPac = (local: number, seed: number) => {
    const next = rng(seed + 47)
    const mode = Math.floor(next() * 5)
    const bottom = Math.max(1, rows - 2)
    /* La poursuite se joue **dans le cadre** : le mur est deux fois et demie
       plus large que ce qu'on voit, et une course sur toute la bande passerait
       les deux tiers du temps hors champ. */
    const half = (columns / 2) * Math.max(0.35, frameSpan)
    const top = Math.max(1, rows - 4)

    /* la trajectoire, en coordonnées de cases, avec le cap (radians, écran) */
    const path = (u: number) => {
      const t = clamp01(u)
      if (mode === 0) return { x: -half - 1 + t * (columns + 2), y: bottom, a: 0 }
      if (mode === 1) return { x: half + 1 - t * (columns + 2), y: bottom - 1, a: Math.PI }
      if (mode === 2) return { x: -half + t * (columns + 1), y: top + t * (bottom - top), a: 0.45 }
      if (mode === 3) return { x: half - t * (columns + 1), y: top + t * (bottom - top), a: Math.PI - 0.45 }
      /* le deux-temps : il descend au milieu, puis il file sur le côté */
      if (t < 0.46) return { x: 3 + Math.sin(t * 9) * 0.6, y: -1 + (t / 0.46) * (bottom + 1), a: Math.PI / 2 }
      return { x: 3 + ((t - 0.46) / 0.54) * (half + 1), y: bottom, a: 0 }
    }

    const here = path(local)
    /* le rond : il garde ses distances, frétille, puis il file pour de bon */
    const escape = ramp(local, 0.66, 0.92)
    const lead = 0.11 + escape * 0.3
    const wiggle = Math.sin(local * 21 + seed * 13) * 0.35 * (1 - escape)
    const dotAt = path(local + lead)
    const dot = { x: dotAt.x, y: dotAt.y + wiggle }
    /* le rond : un point de la taille d'un écran, sans rien derrière lui */
    stamp(dot.x, dot.y, 0.5, (g, ox, oy) => {
      g.fillStyle = '#ffe9b0'
      g.beginPath()
      g.arc(ox, oy, PX * 0.4, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = 'rgba(255,255,255,0.55)'
      g.beginPath()
      g.arc(ox - PX * 0.1, oy - PX * 0.12, PX * 0.1, 0, Math.PI * 2)
      g.fill()
    })

    /* lui : deux fois plus gros qu'avant, et **sur le mur**, jamais sur une
       case noire — seuls les écrans qu'il couvre s'allument */
    const bite = Math.sin(local * 54 + seed * 7) * 0.5 + 0.5
    const mouth = 0.07 + bite * 0.36
    stamp(here.x, here.y, 1.05, (g, ox, oy) => {
      g.fillStyle = '#ffd21e'
      g.beginPath()
      g.moveTo(ox, oy)
      g.arc(ox, oy, PX * 0.9, here.a + mouth, here.a - mouth + Math.PI * 2)
      g.closePath()
      g.fill()
      /* l'œil */
      g.fillStyle = '#2a1c05'
      g.beginPath()
      g.arc(ox - PX * 0.28, oy - PX * 0.34, PX * 0.14, 0, Math.PI * 2)
      g.fill()
    })
  }

  /**
   * Une lettre du cartouche : sa case allumée, et la lettre dessus.
   *
   * La taille est donnée **en écrans** — c'est ce qui permet au mur d'écrire
   * plus petit quand le cadre est étroit (un téléphone ne montre que cinq cases
   * de large) au lieu de couper le mot à gauche et à droite.
   */
  const letterArt = (char: string, size: number, glass: string) =>
    art(`letter:${char}:${size}:${glass}`, () => ({
      w: size,
      h: Math.round(size * 1.18),
      paint: (g) => {
        box(g, 0, 0, size, Math.round(size * 1.18), glass)
        g.fillStyle = '#ffffff'
        g.font = `900 ${Math.round(size * 0.66)}px ${options.font ?? FONT_STACK}`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText(char, size / 2, size * 0.62)
      },
    }))

  /** la taille d'une lettre, en écrans, pour que le mot tienne dans le cadre */
  const letterSize = (count: number, fill = 0.88) =>
    Math.max(8, Math.min(SCREEN_RES, Math.round((seenCols() * fill) / Math.max(1, count))))

  /**
   * Une ligne de lettres, à la vitesse qu'on lui donne : elle s'écrit case par
   * case et s'efface de la même façon.
   */
  const writeRow = (text: string, row: number, progress: number, glass = '#101a30', fixed = 0) => {
    const letters = Array.from(text.toUpperCase())
    if (!letters.length) return 0
    const size = fixed > 0 ? fixed : letterSize(letters.length)
    const run = letters.length * size
    const from = -Math.round(run / 2)
    const shown = Math.ceil(ramp(progress, 0.08, 0.34) * letters.length)
    const gone = Math.floor(ramp(progress, 0.8, 0.98) * letters.length)
    letters.forEach((char, index) => {
      if (index >= shown || index < gone || char === ' ') return
      place(letterArt(char, size, glass), from + index * size, row, 'canvas')
    })
    return from
  }

  /**
   * Le cartouche : la ligne écrite en bas de la bande, avec la pastille rouge
   * de la régie. C'est ce qui fait qu'une vidéo sur le mur se lit comme une
   * diffusion — et pas comme un fond qui bouge.
   */
  const drawCaption = (text: string, local: number) => {
    /* le cartouche se pose sur la même ligne que les figures : juste au-dessus
       de leur sol, dans les rangées qu'on voit vraiment */
    const row = floorRow - 16
    const from = writeRow(text, row, local)
    /* la pastille « en direct », deux cases avant le mot */
    if (text && local > 0.14 && local < 0.9) {
      place(liveArt, from - 30, row + 2, 'canvas')
    }
  }

  /** la pastille « en direct » de la régie */
  const liveArt = art('live', () => ({
    w: 22,
    h: 18,
    paint: (g) => {
      box(g, 0, 0, 22, 18, '#101a30')
      g.fillStyle = '#ff3b30'
      g.beginPath()
      g.arc(11, 9, 5, 0, Math.PI * 2)
      g.fill()
    },
  }))

  /**
   * La page de publicité de NevoMove.
   *
   * Trois temps dans une seule prise, comme un vrai spot : on **annonce**
   * (le marcheur traverse, le nom s'écrit), on **montre** (les Nevomon
   * défilent dans les cases, une rangée dans un sens, l'autre dans l'autre),
   * on **signe** (ce que fait l'application). C'est le mur qui devient une
   * télévision — et il n'a besoin que des cases qu'il a déjà.
   */
  const drawNevomove = (local: number, seed: number) => {
    const next = rng(seed + 61)
    /* les rangées du bas de la bande sont celles qu'on voit : le cartouche et
       le défilé s'y tiennent (voir `floorRow`) */
    const marquee = floorRow - 16
    const titleRow = floorRow - 36
    /* le haut du défilé, en cases de contenu (les créatures font 3,4 cases) */
    const paradeRow = (floorRow - 56) / SCREEN_RES

    /* ---- 1. on annonce ---------------------------------------------------- */
    const intro = clamp01(local / 0.28)
    const walkArt = Math.sin(local * 26) > 0 ? walkRightArt : walkLeftArt
    place(walkArt, -middle + intro * (screenCols + walkArt.width), floorRow - walkArt.height, 'canvas')
    writeRow('NEVOMOVE', marquee, ramp(local, 0.02, 0.28) * 0.999)

    /* ---- 2. on montre : le défilé ---------------------------------------- */
    if (nevomonCount) {
      const parade = ramp(local, 0.26, 0.74)
      if (parade > 0 && parade < 1) {
        /* le défilé traverse **ce qu'on voit** : une créature qui traverse les
           trente cases de la bande passe les deux tiers du temps hors champ */
        const from = seenAt(-0.5) / SCREEN_RES - 5
        const to = seenAt(0.5) / SCREEN_RES + 5
        const span = to - from
        for (let i = 0; i < 3; i += 1) {
          const img = nevomonFor((Math.floor(next() * 997) + i * 3) % nevomonCount)
          if (!img || !img.naturalWidth) continue
          const dir = i % 2 === 0 ? 1 : -1
          const stagger = i * 0.12
          const t = clamp01(parade * 1.3 - stagger)
          const cell = dir > 0 ? from + t * span : to - t * span
          /* Les créatures traversent *en grand* — trois cases de haut, la
             moitié de la bande — sur deux rangées qui se croisent. */
          drawImageInCells(img, cell, paradeRow + (i === 1 ? 0.5 : 0), 3.4)
        }
        /* le nom reste écrit *pendant* le défilé : sans lui, la prise n'a plus
           de sujet pendant deux secondes — on voit des créatures passer, pas
           une publicité */
        writeRow('NEVOMOVE', marquee, 0.4, '#101a30', Math.max(10, letterSize(8, 0.55)))
      }
    }

    /* ---- 3. on signe ----------------------------------------------------- */
    writeRow("L'APP QUI MARCHE", marquee, ramp(local, 0.6, 0.98))
    writeRow('GAGNEZ VOS NEVOMON', titleRow, ramp(local, 0.7, 1))
  }

  /**
   * Une image posée sur les cases, à la taille qu'on lui donne (en cases).
   *
   * On ne met **rien derrière** : les Nevomon sont des GIF à fond transparent,
   * et leur donner une case noire les transformait en vignettes. Ici, seuls les
   * pixels opaques de l'image allument un écran — le reste du mur continue de
   * vivre derrière la créature.
   */
  const drawImageInCells = (img: HTMLImageElement, cellX: number, cellY: number, size: number) => {
    const side = size * PX
    const cc = wrapCol(Math.round(cellX))
    const scale = Math.min(side / img.naturalWidth, side / img.naturalHeight)
    const w = img.naturalWidth * scale
    const h = img.naturalHeight * scale
    ctx.save()
    ctx.beginPath()
    ctx.rect(x(cc), y(Math.round(cellY)), side, side)
    ctx.clip()
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(img, x(cc) + (side - w) / 2, y(Math.round(cellY)) + (side - h) / 2, w, h)
    ctx.imageSmoothingEnabled = false
    ctx.restore()
  }

  const drawWord = (text: string, local: number, seed: number) => {
    /* l'espace *compte* : « SITE WEB » doit s'écrire en deux mots, pas en un
       seul — la case reste vide, mais elle occupe sa place */
    const letters = Array.from(text.toUpperCase())
    if (!letters.length) return
    const next = rng(seed)
    /* Un mot court s'écrit en grandes lettres — deux cases de haut, comme le
       mot de l'hôte — un mot long se resserre pour tenir dans le cadre. Le mur
       choisit la taille, il ne coupe plus les mots à ses deux bords. */
    const big = letters.length <= 6
    const size = big ? SCREEN_RES * 2 : letterSize(letters.length, 0.9)
    const run = letters.length * size
    const jitter = Math.round((next() - 0.5) * 3)
    const start = -Math.round(run / 2) + jitter
    /* le mot s'écrit juste au-dessus du sol des figures */
    const row = floorRow - Math.round(size * 1.2) - Math.round(next() * 6)
    const order = shuffled(letters.length, seed + 13)
    const appear = Math.ceil(ramp(local, 0, 0.34) * letters.length)
    const gone = Math.floor(ramp(local, 0.62, 0.94) * letters.length)
    const shown = new Array<boolean>(letters.length).fill(true)
    order.forEach((letter, step) => {
      if (step >= appear || step < gone) shown[letter] = false
    })

    for (let i = 0; i < letters.length; i += 1) {
      if (!shown[i]) continue
      if (letters[i] === ' ') continue
      place(letterArt(letters[i], size, '#0c0c11'), start + i * size, row, 'canvas')
    }
  }

  /** lit squares, appearing then going out one cell at a time */
  const drawMark = (local: number, seed: number) => {
    const next = rng(seed)
    const mark = MARKS[Math.floor(next() * MARKS.length) % MARKS.length]
    const scale = mark.length <= 3 ? 2 : 1
    const cols = mark[0].length * scale
    const rowsTall = mark.length * scale
    const col0 = -Math.round(cols / 2) + Math.round((next() - 0.5) * 4)
    /* le dessin se pose dans le bas de la bande, comme le reste : le haut est
       mangé par le fondu */
    const row0 = Math.max(0, Math.round((rows - rowsTall) * 0.72))

    const cells: Array<[number, number]> = []
    mark.forEach((line, r) => {
      Array.from(line).forEach((char, c) => {
        if (char !== '#') return
        for (let i = 0; i < scale; i += 1) for (let j = 0; j < scale; j += 1) cells.push([col0 + c * scale + i, row0 + r * scale + j])
      })
    })
    const order = shuffled(cells.length, seed + 5)
    const appear = Math.ceil(ramp(local, 0, 0.34) * cells.length)
    const gone = Math.floor(ramp(local, 0.62, 0.94) * cells.length)
    order.forEach((index, step) => {
      if (step >= appear || step < gone) return
      const [col, row] = cells[index]
      block(col, row)
    })
  }

  /* ---- the take --------------------------------------------------------- */
  const weights: Record<FeedChannel, number> = {
    word: 1,
    mark: 1,
    wave: 1.6,
    page: 1.6,
    runner: 1.6,
    video: 2.4,
    nevomove: 2.6,
    /* la transition est un geste, pas un tableau : elle tient une seconde */
    wipe: 0.5,
    /* les figures tiennent un peu plus longtemps : un saut, une montée de
       triangles, une poursuite — ça se regarde, ça ne se devine pas */
    mario: 2.6,
    shapes: 2.2,
    pac: 2.6,
    ...options.channels,
  }
  const programmeFor = (seed: number, first: boolean): Beat[] => {
    /* La **première** prise est un extrait : c'est ce qui donne au mur l'air
       d'une régie qui vient de s'allumer, et c'est comme ça qu'on voit la
       vidéo au lieu de l'attendre. */
    const channels: FeedChannel[] = first && clips.length
      ? ['video', 'word']
      : PROGRAMMES[Math.floor(rng(seed + 91)() * PROGRAMMES.length) % PROGRAMMES.length]
    return channels.filter((kind) => weights[kind] > 0).map((kind) => ({ kind, weight: weights[kind] }))
  }

  let pinned: FeedChannel | null = null
  let momentCount = 0
  let lastTake = Number.NaN
  let lastStep = -1
  let lastSeed = Number.NaN
  let lastWord = ''
  let lastPhase = 0
  let lastDuration = 7.2
  /**
   * La part de la bande que le cadre montre (0 → 1) : elle décide du cadrage
   * des images diffusées, et elle change quand la fenêtre change de forme.
   */
  let frameSpan = 1
  /** la prise que la dernière peinture a jouée (voir `Feed.beat`) */
  let lastBeat = ''

  const paint = (text: string, seed: number, phase: number) => {
    const t = clamp01(phase)
    /* before the first moment the seed is still NaN — a take of its own is
       painted from a fixed seed so the wall is never asked to play nothing */
    const take = Number.isFinite(seed) ? seed : 0.17
    /* un nouveau germe = une nouvelle prise : c'est ce qui compte les prises */
    if (Number.isFinite(seed) && seed !== lastTake) {
      lastTake = seed
      momentCount += 1
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const programme = pinned
      ? [{ kind: pinned, weight: 1 }]
      : programmeFor(take, momentCount <= 1)
    const total = programme.reduce((sum, beat) => sum + beat.weight, 0) || 1
    lastBeat = ''
    let cursor = 0
    programme.forEach((beat, index) => {
      const from = cursor / total
      cursor += beat.weight
      const to = cursor / total
      if (t < from || t >= to) return
      const local = (t - from) / Math.max(0.0001, to - from)
      const beatSeed = take + index * 31
      lastBeat = beat.kind
      if (beat.kind === 'word') drawWord(text, local, beatSeed)
      else if (beat.kind === 'mark') drawMark(local, beatSeed)
      else if (beat.kind === 'runner') broadcast(() => drawRun(local))
      else if (beat.kind === 'mario') broadcast(() => drawMario(local, beatSeed))
      else if (beat.kind === 'shapes') drawShapes(local, beatSeed)
      else if (beat.kind === 'wipe') drawWipe(local, beatSeed)
      else if (beat.kind === 'pac') drawPac(local, beatSeed)
      else if (beat.kind === 'wave') broadcast(() => drawWave(local, beatSeed))
      else if (beat.kind === 'video') {
        /* la vidéo est étalée dans le tampon, puis le cartouche est écrit
           *après* la bascule des cases — sinon la bascule l'effacerait */
        broadcast(() => drawVideoFrame(beatSeed, lastDuration * (beat.weight / total), local))
        drawCaption(clipFor(beatSeed)?.label ?? '', local)
      }
      else if (beat.kind === 'nevomove') drawNevomove(local, beatSeed)
      else broadcast(() => drawPage(local, beatSeed))
    })
    /* une vidéo ne joue que pour sa prise : dès qu'on passe à autre chose, on
       la met en pause (batterie, et un pied de page qui se tait vraiment) */
    if (!clipUsed && playingClip) {
      playingClip.pause()
      playingClip = null
      clipKey = ''
    }
    clipUsed = false
    texture.needsUpdate = true
  }

  /* the letters are drawn in the site's own face: redraw the current take once
     the webfont lands, or the wall writes in a fallback for the whole session */
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
  fonts?.ready?.then(() => {
    paint(lastWord, lastSeed, lastPhase)
  })

  return {
    texture,
    columns: screenCols,
    rows: screenRows,
    pin: (channel) => {
      /* `checker` est l'ancien nom de la transition (voir `drawWipe`) */
      pinned = ((channel as string) === 'checker' ? 'wipe' : channel) as FeedChannel | null
      lastStep = -1
    },
    beat: () => lastBeat,
    canvas: () => canvas,
    update: (word, seed, phase, duration = 7.2, view = frameSpan) => {
      lastPhase = phase
      lastDuration = duration
      /* la fenêtre a changé de forme : le cadrage des images est à refaire */
      if (Math.abs(view - frameSpan) > 0.005) {
        frameSpan = clamp01(view)
        lastStep = -1
      }
      /* the moment is quantised at `FPS` frames a second, so a picture holds
         still between two of them — a broadcast beat needs that finer grid, or
         a wave reads as a slideshow */
      const steps = Math.max(1, Math.min(1200, Math.round(lastDuration * FPS)))
      const step = Math.round(clamp01(phase) * steps)
      if (step === lastStep && seed === lastSeed && word === lastWord) return
      lastStep = step
      lastSeed = seed
      lastWord = word
      paint(word, seed, step / steps)
    },
    dispose: () => {
      sheets.clear()
      clips.forEach((clip) => clip.video?.pause())
      texture.dispose()
    },
  }
}
