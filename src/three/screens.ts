import * as THREE from 'three'

/**
 * The video wall's feed.
 *
 * The room is a wall of screens, and this is what they show. Everything is
 * painted here, on the CPU, into one canvas that the backdrop samples per
 * cell — which is what makes a *run of cells* able to carry one big letter, a
 * drawing made of lit squares, a picture that scrolls screen by screen, or a
 * little runner hopping over a gap with something on his heels. Doing it in
 * the shader would have meant a hash per cell and a single letter per cell;
 * doing it here means the picture can be composed.
 *
 * Two languages live in the same canvas, on purpose:
 *
 * - the **written** one (a word, a drawing) is painted at full resolution and
 *   snaps from take to take: a display that writes holds its frame;
 * - the **broadcast** one (the sea, the page, the runner) is painted on a grid
 *   of two samples per screen and blown up with smoothing off, so the picture
 *   is literally carried by the cells, one screen at a time.
 *
 * The canvas is transparent wherever nothing is being shown, so a cell never
 * lights up "for nothing": the room underneath is left exactly as it was.
 */
export const SCREEN_COLS = 22
export const SCREEN_ROWS = 6

/** one wall cell, in canvas pixels */
const CELL = 64
/** how many times a second the feed is redrawn while a moment is playing */
const FPS = 15
/** what one screen can show of a broadcast picture: 2 × 2 samples */
const SAMPLES = 2
const SW = SCREEN_COLS * SAMPLES
const SH = SCREEN_ROWS * SAMPLES

/**
 * The room is a cylinder the size of the whole canvas, and the camera looks
 * straight at the seam between its last column and its first — column 0 is
 * what the visitor has in front of them. Everything the wall *writes* is
 * therefore centred on that seam, or it would be written off screen.
 */
const wrapCol = (col: number) => ((col % SCREEN_COLS) + SCREEN_COLS) % SCREEN_COLS

type Channel = 'word' | 'mark' | 'wave' | 'page' | 'runner'

/**
 * One beat of a take: which channel plays, and how long it holds relative to
 * its neighbours. The written beats are shorter — a word lands, you read it,
 * it goes out — while the broadcast beats get the time to actually move.
 */
type Beat = { kind: Channel; weight: number }

const wordBeat = (): Beat => ({ kind: 'word', weight: 1 })
const markBeat = (): Beat => ({ kind: 'mark', weight: 1 })
const waveBeat = (): Beat => ({ kind: 'wave', weight: 1.6 })
const pageBeat = (): Beat => ({ kind: 'page', weight: 1.6 })
const runnerBeat = (): Beat => ({ kind: 'runner', weight: 1.6 })

/** the takes the wall picks from, one per moment */
const PROGRAMS: Beat[][] = [
  [wordBeat(), markBeat(), wordBeat()],
  [wordBeat(), waveBeat(), runnerBeat()],
  [waveBeat(), wordBeat(), runnerBeat()],
  [pageBeat(), wordBeat(), waveBeat()],
  [wordBeat(), pageBeat(), wordBeat()],
  [runnerBeat(), wordBeat(), pageBeat()],
]

/** the drawings, as cells: `#` is a lit square, `.` is left alone */
const MARKS: string[][] = [
  /* a ring */
  ['.##.', '#..#', '#..#', '.##.'],
  /* an arrow */
  ['..#..', '.###.', '#####', '..#..', '..#..'],
  /* a plus */
  ['..#..', '#####', '..#..'],
  /* a square wave — the studio's signal */
  ['#...#', '#...#', '#####', '....#'],
  /* bars */
  ['#..#..', '#.#.#.', '#####.'],
  /* a lens */
  ['.#.#.', '#.#.#', '.#.#.'],
]

/**
 * Photos the studio can drop into `src/assets/feed/`: they are played back
 * through the same cells as everything else. Nothing is shipped with the site,
 * so the wall falls back to a drawn sheet — but the moment a file lands in that
 * folder, the wall broadcasts it.
 */
const FEED_PHOTOS = Object.values(
  import.meta.glob('../assets/feed/*.{png,jpg,jpeg,webp,avif}', {
    eager: true,
    query: '?url',
    import: 'default',
  }) as Record<string, string>,
)

const FONT_STACK = "'Inter Tight Variable', 'Inter Tight', 'Inter Variable', 'Helvetica Neue', Arial, sans-serif"

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const ramp = (t: number, from: number, to: number) => clamp01((t - from) / Math.max(0.0001, to - from))

/** a tiny deterministic generator: the same seed always paints the same take */
function rng(seed: number) {
  let s = (Math.floor(Math.abs(seed) * 9973) % 2147483647) + 1
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

/** the take this seed plays: the same moment always runs the same programme */
function programFor(seed: number): Beat[] {
  const next = rng(seed + 91)
  return PROGRAMS[Math.floor(next() * PROGRAMS.length) % PROGRAMS.length]
}

/* ---- the comic sheet ----------------------------------------------------- */

const PAPER = '#e9e7e0'
const INK = '#08080a'
const TONE = '#b0aea8'
/** one motif of the sheet: what the camera can hold at once, twice over */
const MOTIF = SW / 2

type Rand = () => number

/** screentone: a dot grid, denser where the light does not reach */
function paintTone(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, density: number, next: Rand) {
  c.fillStyle = TONE
  for (let py = y; py < y + h; py += 2) {
    for (let px = x; px < x + w; px += 2) {
      const d = (px - x) / Math.max(1, w) + (py - y) / Math.max(1, h)
      if (next() < density * (0.3 + d * 0.9)) c.fillRect(px, py, 1, 1)
    }
  }
}

/**
 * A face in close-up: a mass of hair, the light of a cheek, one heavy eye. At
 * this scale nothing else survives the wall, so nothing else is drawn.
 */
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

/** a standing silhouette: head, shoulders, cloak, legs — the hero shot */
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

/** a range of hills and a low sun, drawn as lines and a disc — never a triangle */
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
 * Four bands of comic page, painted once per seed and then *windowed*: the
 * wall shows one band of it and the band travels down a couple of samples at a
 * time. That is the whole trick behind an image that scrolls case par case —
 * nothing is animated, the picture is being read in whole screens, which is
 * exactly what a wall of monitors does to a frame.
 */
function paintSheet(seed: number): HTMLCanvasElement {
  const sheet = document.createElement('canvas')
  sheet.width = SW
  sheet.height = SH * 4
  const c = sheet.getContext('2d')
  if (!c) return sheet
  const next = rng(seed + 17)

  c.fillStyle = PAPER
  c.fillRect(0, 0, sheet.width, sheet.height)

  for (let band = 0; band < 4; band += 1) {
    const top = band * SH
    const kind = Math.floor(next() * 4)
    /* the motif is painted on its own, then placed like a strip of wall: once
       across the seam of the room — which is what the camera is looking at —
       and once half a turn further, so the page keeps passing all the way
       round instead of running out at the edge of the canvas */
    const motif = document.createElement('canvas')
    motif.width = MOTIF
    motif.height = SH
    const m = motif.getContext('2d')
    if (!m) continue
    m.fillStyle = PAPER
    m.fillRect(0, 0, MOTIF, SH)
    if (kind === 0) paintFace(m, MOTIF, SH, next)
    else if (kind === 1) paintBurst(m, MOTIF, SH, next)
    else if (kind === 2) paintRange(m, MOTIF, SH, next)
    else paintSlash(m, MOTIF, SH)
    /* the gutter, so the band still reads as pages passing */
    m.fillStyle = INK
    m.fillRect(0, 0, 1, SH)
    const half = Math.round(MOTIF / 2)
    c.drawImage(motif, half, top)
    c.drawImage(motif, -half, top)
    c.drawImage(motif, Math.round(MOTIF * 1.5), top)
  }

  return sheet
}

type Painter = {
  texture: THREE.CanvasTexture
  paint: (word: string, seed: number, phase: number) => void
}

function createPainter(): Painter | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = SCREEN_COLS * CELL
  canvas.height = SCREEN_ROWS * CELL
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false

  /* dev/QA: the raw feed, so what the wall shows can be looked at on its own
     instead of being guessed at through the room (see `scripts/feed-shot.mjs`) */
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    ;(window as unknown as { __feed?: HTMLCanvasElement }).__feed = canvas
  }

  /* the broadcast buffer: one screen is `SAMPLES` × `SAMPLES` pixels here, and
     it is blown up with smoothing off, so a picture is carried by the cells and
     never smeared across them */
  const vid = document.createElement('canvas')
  vid.width = SW
  vid.height = SH
  const vctx = vid.getContext('2d')
  if (!vctx) return null

  const sheets = new Map<number, HTMLCanvasElement>()
  const sheetFor = (seed: number) => {
    const key = Math.round(seed * 1000)
    let sheet = sheets.get(key)
    if (!sheet) {
      sheet = paintSheet(seed)
      sheets.set(key, sheet)
      if (sheets.size > 3) sheets.delete(sheets.keys().next().value as number)
    }
    return sheet
  }

  /* the photos dropped into `src/assets/feed/`: whatever the studio wants the
     wall to run, played back through the same cells as everything else */
  const photos: Array<HTMLImageElement | null> = FEED_PHOTOS.map(() => null)
  FEED_PHOTOS.forEach((url, index) => {
    if (typeof Image === 'undefined') return
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      photos[index] = img
    }
    img.src = url
  })

  const x = (col: number) => col * CELL
  const y = (row: number) => row * CELL

  /** one lit screen: its dark glass and the black frame that separates it
      from the screen next door — the bezel of the video wall */
  const screen = (col: number, row: number) => {
    const cc = wrapCol(col)
    ctx.fillStyle = '#0c0c11'
    ctx.fillRect(x(cc), y(row), CELL, CELL)
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = Math.round(CELL * 0.055)
    ctx.strokeRect(x(cc) + ctx.lineWidth / 2, y(row) + ctx.lineWidth / 2, CELL - ctx.lineWidth, CELL - ctx.lineWidth)
  }

  /** a lit square inside one screen (the drawings are made of these) */
  const block = (col: number, row: number) => {
    const cc = wrapCol(col)
    screen(cc, row)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x(cc) + CELL * 0.15, y(row) + CELL * 0.15, CELL * 0.7, CELL * 0.7)
  }

  /* ---- the broadcast: one picture, carried by the cells ----------------- */
  const broadcast = (draw: () => void) => {
    vctx.clearRect(0, 0, SW, SH)
    draw()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(vid, 0, 0, SW, SH, 0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingEnabled = true
  }

  /** one screen of the broadcast picture, as a block of samples */
  const sample = (col: number, row: number, value: number, alpha = 1) => {
    const cc = wrapCol(col)
    const g = Math.round(clamp01(value) * 255)
    vctx.fillStyle = `rgba(${g}, ${g}, ${g}, ${alpha})`
    vctx.fillRect(cc * SAMPLES, row * SAMPLES, SAMPLES, SAMPLES)
  }

  /**
   * The sea. A swell travels across the wall, the crest breaks, and the body of
   * the water is *lit* — on a black wall, dark water is simply a hole in the
   * wall, and the swell has to be read through it.
   */
  const drawWave = (local: number, seed: number) => {
    const next = rng(seed + 3)
    const run = local * 1.6
    const breakAt = ((run * 0.6 + next() * 0.25) % 1.2) - 0.1
    for (let col = 0; col < SCREEN_COLS; col += 1) {
      const p = col / (SCREEN_COLS - 1)
      /* one long swell and a half across the wall: the eye reads a surface
         travelling, which a short wavelength turns back into a texture */
      const phase = p * 2.4 - run * 3.2 + seed * 6.2831
      let surface = 0.44 + 0.16 * Math.sin(phase) + 0.07 * Math.sin(phase * 2.9 + 1.1)
      const swell = Math.exp(-Math.pow((p - breakAt) * 3.6, 2)) * 0.36
      surface += swell
      const top = surface * SCREEN_ROWS
      for (let row = 0; row < SCREEN_ROWS; row += 1) {
        const depth = row + 0.5 - top
        if (depth < -0.6) {
          /* spray: a few screens of foam thrown above the breaking crest */
          const spray = swell > 0.26 && rng(seed + col * 7.3 + row * 11.7 + Math.round(run * 30))() > 0.72
          if (spray) sample(col, row, 0.55 + 0.35 * next())
          continue
        }
        if (depth < 0.45) {
          const foam = rng(seed + col * 5.1 + row * 3.3 + Math.round(run * 30))()
          sample(col, row, 0.86 + foam * 0.14)
          continue
        }
        const shade = Math.max(0, 1 - depth / 4.4)
        const grain = rng(seed + col * 3.1 + Math.round(row + run * 6) * 5.7)()
        sample(col, row, 0.22 + shade * 0.5 + grain * 0.07)
      }
    }
  }

  /**
   * The page — a photo if the studio dropped one in, a drawn comic sheet
   * otherwise. Either way the wall shows a band of it and the band travels
   * down in whole cells: the picture scrolls case par case, the way a wall of
   * monitors reads a frame.
   */
  const drawPage = (local: number, seed: number) => {
    const photo = photos.find((img): img is HTMLImageElement => !!img && img.naturalWidth > 0)
    if (photo) {
      const scale = SW / photo.naturalWidth
      const bandH = SH / scale
      const maxY = Math.max(0, photo.naturalHeight - bandH)
      const steps = Math.max(1, Math.floor(maxY / SAMPLES))
      const sy = Math.min(maxY, Math.floor(local * steps) * SAMPLES)
      vctx.imageSmoothingEnabled = true
      vctx.drawImage(photo, 0, sy, photo.naturalWidth, bandH, 0, 0, SW, SH)
      return
    }
    const sheet = sheetFor(seed)
    const maxY = Math.max(0, sheet.height - SH)
    const steps = Math.max(1, Math.floor(maxY / SAMPLES))
    const sy = Math.min(maxY, Math.floor(local * steps * 0.86) * SAMPLES)
    vctx.imageSmoothingEnabled = false
    vctx.drawImage(sheet, 0, sy, SW, SH, 0, 0, SW, SH)
  }

  /* ---- the runner --------------------------------------------------------
     A little figure crossing the wall on foot, jumping the gaps, with
     something on his heels. It is drawn in *cells*, one screen per pixel of
     the sprite: the wall is the resolution, and that is the joke. */

  /**
   * The runner: four screens tall, three wide, and two frames of a run — the
   * front leg steps, the arm swings back, the eye stays a screen left dark.
   * Any taller and he would have no room left to jump in a band six deep.
   */
  const drawRunner = (cx: number, base: number, frame: number, lift: number) => {
    const top = base - 3 - lift
    const step = frame % 2 === 0 ? 1 : 0
    const swing = frame % 2 === 0 ? 1 : -1
    sample(cx - 1, top, 0.95)
    sample(cx, top, 0.95)
    sample(cx - 1, top + 1, 0.95)
    /* the eye: a screen left dark inside a lit head */
    sample(cx, top + 1, 0.08)
    sample(cx - 1, top + 2, 0.95)
    sample(cx + swing, top + 2, 0.62)
    sample(cx - 1, top + 3, 0.9)
    sample(cx + step, top + 3, 0.9)
  }

  /** what is chasing him: a low, wide thing with two eyes and a row of teeth */
  const drawChaser = (cx: number, base: number, hop: number) => {
    const top = base - 2 - hop
    for (let c = -1; c <= 1; c += 1) sample(cx + c, top, 0.9)
    for (let c = -2; c <= 2; c += 1) sample(cx + c, top + 1, 0.9)
    sample(cx - 1, top + 1, 0.08)
    sample(cx + 1, top + 1, 0.08)
    for (let c = -2; c <= 2; c += 1) if ((c + 2) % 2 === 0) sample(cx + c, top + 2, 0.85)
  }

  const drawRun = (local: number, seed: number) => {
    const next = rng(seed + 7)
    const base = SCREEN_ROWS - 1
    /* the ground scrolls under him: one screen at a time, which is what makes
       the run read as travel rather than as a sprite being dragged */
    const travel = Math.floor(local * 26)
    const gapA = 16 - travel
    const gapB = gapA + 22
    const inGap = (col: number) => {
      for (const gap of [gapA, gapB, gapA - 22, gapB + 22]) {
        if (Math.abs(col - gap) < 1.5) return true
      }
      return false
    }
    for (let col = 0; col < SCREEN_COLS; col += 1) {
      if (inGap(col)) continue
      sample(col, base, 0.3 + ((col + travel) % 3 === 0 ? 0.12 : 0))
      if ((col + travel) % 5 === 0) sample(col, base - 1, 0.16)
    }

    /* he runs just off the seam of the room — which is the middle of the
       frame — and the chaser follows on the other side of it */
    const hereX = 2
    const distanceToGap = gapA - hereX
    /* he takes off a little before the edge and lands on the other side — two
       screens of air is all a band six screens deep can give him */
    const jump = distanceToGap > -1 && distanceToGap < 5 ? Math.sin(((5 - distanceToGap) / 6) * Math.PI) : 0
    const lift = Math.round(jump * 2)
    const frame = Math.floor(local * 34)
    drawRunner(hereX, base, frame, lift)
    /* the chaser leaves the ground a beat after he does */
    const behind = hereX - 6
    const hop = distanceToGap > 0 && distanceToGap < 6 ? Math.round(jump * 1.4) : 0
    drawChaser(behind, base, hop)
  }

  /* ---- the written channels -------------------------------------------- */
  const drawWord = (text: string, local: number, seed: number) => {
    const letters = Array.from(text.toUpperCase()).filter((char) => char !== ' ')
    if (!letters.length) return
    /* short words get letters two cells wide, so the wall has to *combine*
       cells to show them; longer ones fit one cell each */
    const span = letters.length <= 6 ? 2 : 1
    const run = letters.length * span
    const next = rng(seed)
    /* centred on the seam of the room, with a little slack: written off to the
       side of it, the word would be written where the visitor cannot see it */
    const jitter = Math.round((next() - 0.5) * 3)
    const start = -Math.round(run / 2) + jitter
    const row = span === 2 ? 2 : 3 - Math.floor(next() * 2)
    const order = shuffled(letters.length, seed + 13)
    const appear = Math.ceil(ramp(local, 0, 0.34) * letters.length)
    const gone = Math.floor(ramp(local, 0.62, 0.94) * letters.length)
    const shown = new Array<boolean>(letters.length).fill(true)
    order.forEach((letter, step) => {
      if (step >= appear || step < gone) shown[letter] = false
    })

    for (let i = 0; i < letters.length; i += 1) {
      if (!shown[i]) continue
      for (let c = 0; c < span; c += 1) {
        for (let r = 0; r < span; r += 1) screen(start + i * span + c, row + r)
      }
      const cx = wrapCol(start + i * span)
      ctx.fillStyle = '#ffffff'
      ctx.font = `900 ${Math.round(span * CELL * 0.76)}px ${FONT_STACK}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(letters[i], x(cx) + (span * CELL) / 2, y(row) + (span * CELL) / 2 + span * CELL * 0.03)
    }
  }

  /* ---- the drawing: lit squares, appearing and going out one at a time -- */
  const drawMark = (local: number, seed: number) => {
    const next = rng(seed)
    const mark = MARKS[Math.floor(next() * MARKS.length) % MARKS.length]
    /* drawings are scaled up to two cells per pixel of the pattern so they
       take over a real part of the wall instead of sitting in a corner */
    const scale = mark.length <= 3 ? 2 : 1
    const cols = mark[0].length * scale
    const rows = mark.length * scale
    const col0 = -Math.round(cols / 2) + Math.round((next() - 0.5) * 4)
    const row0 = Math.max(0, Math.floor((SCREEN_ROWS - rows) / 2))

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

  /** QA escape hatch: `?feed=wave` pins one channel on the wall */
  const pinned =
    typeof window === 'undefined'
      ? null
      : (new URLSearchParams(window.location.search).get('feed') as Channel | null)

  const paint = (text: string, seed: number, phase: number) => {
    const t = clamp01(phase)
    /* before the first moment the seed is still NaN — a take of its own is
       painted from a fixed seed so the wall is never asked to play nothing */
    const take = Number.isFinite(seed) ? seed : 0.17
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const program = pinned
      ? PROGRAMS[PROGRAMS.length - 1].map((beat) => ({ ...beat, kind: pinned }))
      : programFor(take)
    const total = program.reduce((sum, beat) => sum + beat.weight, 0)
    let cursor = 0
    program.forEach((beat, index) => {
      const from = cursor / total
      cursor += beat.weight
      const to = cursor / total
      if (t < from || t >= to) return
      const local = (t - from) / Math.max(0.0001, to - from)
      const beatSeed = take + index * 31
      if (beat.kind === 'word') drawWord(text, local, beatSeed)
      else if (beat.kind === 'mark') drawMark(local, beatSeed)
      else if (beat.kind === 'runner') broadcast(() => drawRun(local, beatSeed))
      else if (beat.kind === 'wave') broadcast(() => drawWave(local, beatSeed))
      else broadcast(() => drawPage(local, beatSeed))
    })
    texture.needsUpdate = true
  }

  /* the letters are drawn in the site's display face: redraw the current take
     once the webfont lands, or the wall would write in a fallback for the
     whole session */
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
  fonts?.ready?.then(() => {
    paint(lastWord, lastSeed, lastPhase)
  })

  return { texture, paint }
}

const painter = createPainter()
let lastStep = -1
let lastSeed = Number.NaN
let lastWord = ''
let lastPhase = 0

/** the wall's texture — what the backdrop samples, cell by cell */
export const screenTexture = painter?.texture ?? null

/**
 * Repaint the wall only when the take actually changes: the moment is quantised
 * at `FPS` frames per second, so a picture holds still between two of them and
 * the wall reads as a deliberate display instead of a continuously animated
 * texture. The broadcast beats need that finer grid — a wave redrawn four times
 * a second reads as a slideshow, not as water.
 */
export function updateScreens(word: string, seed: number, phase: number, duration = 7.2) {
  if (!painter) return
  lastPhase = phase
  const steps = Math.max(1, Math.min(1200, Math.round(duration * FPS)))
  const step = Math.round(clamp01(phase) * steps)
  if (step === lastStep && seed === lastSeed && word === lastWord) return
  lastStep = step
  lastSeed = seed
  lastWord = word
  painter.paint(word, seed, step / steps)
}
