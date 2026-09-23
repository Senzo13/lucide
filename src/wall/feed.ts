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

/** how many screens the feed is wide and tall */
export const SCREEN_COLS = 22
export const SCREEN_ROWS = 6

/** one screen, in canvas pixels */
const CELL = 64
/** how many times a second the feed is redrawn while a moment is playing */
const FPS = 15
/** what one screen can show of a broadcast picture: 2 × 2 samples */
const SAMPLES = 2
const SW = SCREEN_COLS * SAMPLES
const SH = SCREEN_ROWS * SAMPLES
const MOTIF = SW / 2

/**
 * The wall wraps around the room, and the camera faces the seam between its
 * last column and its first. Column 0 is therefore the middle of the frame:
 * everything the wall *writes* is centred on it, or it is written off screen.
 */
const wrapCol = (col: number) => ((col % SCREEN_COLS) + SCREEN_COLS) % SCREEN_COLS

export type FeedChannel = 'word' | 'mark' | 'wave' | 'page' | 'runner'

/** a sprite is rows of cells: `#` lit, `.` off, `o` a screen left dark (an eye) */
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
  /** the font the wall writes in */
  font?: string
}

export type Feed = {
  /** the texture the wall samples — `null` when there is no browser canvas */
  texture: THREE.CanvasTexture | null
  /** repaint if this take is not the one already on the wall */
  update: (word: string, seed: number, phase: number, duration?: number) => void
  /** pin one channel, for review (`?feed=runner`); `null` lets the takes run */
  pin: (channel: FeedChannel | null) => void
  columns: number
  rows: number
  dispose: () => void
}

type Beat = { kind: FeedChannel; weight: number }

/** the programmes a moment draws from: three beats each, words are the anchors */
const PROGRAMMES: FeedChannel[][] = [
  ['word', 'mark', 'word'],
  ['word', 'wave', 'runner'],
  ['wave', 'word', 'runner'],
  ['page', 'word', 'wave'],
  ['word', 'page', 'word'],
  ['runner', 'word', 'page'],
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
 * The runner and what follows him, drawn as cells. They are *our* sprites, and
 * they are data: pass your own through `runner` / `chaser` and the wall plays
 * them through the same cells.
 */
const RUNNER_RUN: Sprite[] = [
  ['##.', '#o.', '.#.', '#.#'],
  ['##.', '#o.', '.#.', '.#.'],
]
const RUNNER_AIR: Sprite = ['##.', '#o.', '.#.', '#.#']
const CHASER: Sprite = ['.###.', '#o#o#', '#.#.#']

const FONT_STACK = "'Inter Tight Variable', 'Inter Tight', 'Inter Variable', 'Helvetica Neue', Arial, sans-serif"

/* the comic sheet the page channel falls back to when no photo is supplied */
const PAPER = '#e9e7e0'
const INK = '#08080a'
const TONE = '#b0aea8'

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
  const columns = SCREEN_COLS
  const rows = SCREEN_ROWS
  const empty: Feed = {
    texture: null,
    update: () => {},
    pin: () => {},
    columns,
    rows,
    dispose: () => {},
  }
  if (typeof document === 'undefined') return empty

  const canvas = document.createElement('canvas')
  canvas.width = columns * CELL
  canvas.height = rows * CELL
  const ctx = canvas.getContext('2d')
  if (!ctx) return empty

  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false

  /* the broadcast buffer: one screen is `SAMPLES` × `SAMPLES` pixels here, and
     it is blown up with smoothing off, so a picture is carried by the cells */
  const buffer = document.createElement('canvas')
  buffer.width = SW
  buffer.height = SH
  const bctx = buffer.getContext('2d')
  if (!bctx) return empty

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

  /* the photos the caller supplied, played back through the same cells */
  const photos: Array<HTMLImageElement | null> = (options.photos ?? []).map(() => null)
  ;(options.photos ?? []).forEach((url, index) => {
    if (typeof Image === 'undefined') return
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      photos[index] = img
    }
    img.src = url
  })

  const runnerFrames = options.runner ?? RUNNER_RUN
  const runnerAir = runnerFrames[runnerFrames.length - 1] ?? RUNNER_AIR
  const chaserSprite = options.chaser ?? CHASER

  const x = (col: number) => col * CELL
  const y = (row: number) => row * CELL

  /** one lit screen: its dark glass and the black frame that separates it from
      the screen next door — the bezel of the video wall */
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
    bctx.clearRect(0, 0, SW, SH)
    draw()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(buffer, 0, 0, SW, SH, 0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingEnabled = true
  }

  /** one screen of the broadcast picture */
  const sample = (col: number, row: number, value: number, alpha = 1) => {
    const cc = wrapCol(col)
    const g = Math.round(clamp01(value) * 255)
    bctx.fillStyle = `rgba(${g}, ${g}, ${g}, ${alpha})`
    bctx.fillRect(cc * SAMPLES, row * SAMPLES, SAMPLES, SAMPLES)
  }

  const paintSprite = (sprite: Sprite, col0: number, row0: number) => {
    sprite.forEach((line, r) => {
      Array.from(line).forEach((char, c) => {
        if (char === '.') return
        sample(col0 + c, row0 + r, char === 'o' ? 0.08 : 0.95)
      })
    })
  }

  /* ---- the sea ---------------------------------------------------------- */
  const drawWave = (local: number, seed: number) => {
    const next = rng(seed + 3)
    const run = local * 1.6
    const breakAt = ((run * 0.6 + next() * 0.25) % 1.2) - 0.1
    for (let col = 0; col < columns; col += 1) {
      const p = col / (columns - 1)
      /* one long swell and a half across the wall: the eye reads a surface
         travelling, which a short wavelength turns back into a texture */
      const phase = p * 2.4 - run * 3.2 + seed * 6.2831
      let surface = 0.44 + 0.16 * Math.sin(phase) + 0.07 * Math.sin(phase * 2.9 + 1.1)
      const swell = Math.exp(-Math.pow((p - breakAt) * 3.6, 2)) * 0.36
      surface += swell
      const top = surface * rows
      for (let row = 0; row < rows; row += 1) {
        const depth = row + 0.5 - top
        if (depth < -0.6) {
          const spray = swell > 0.26 && rng(seed + col * 7.3 + row * 11.7 + Math.round(run * 30))() > 0.72
          if (spray) sample(col, row, 0.55 + 0.35 * next())
          continue
        }
        if (depth < 0.45) {
          const foam = rng(seed + col * 5.1 + row * 3.3 + Math.round(run * 30))()
          sample(col, row, 0.86 + foam * 0.14)
          continue
        }
        /* the body of the water is *lit*: on a black wall, dark water is simply
           a hole in the wall, and the swell has to be read through it */
        const shade = Math.max(0, 1 - depth / 4.4)
        const grain = rng(seed + col * 3.1 + Math.round(row + run * 6) * 5.7)()
        sample(col, row, 0.22 + shade * 0.5 + grain * 0.07)
      }
    }
  }

  /* ---- the page --------------------------------------------------------- */
  const drawPage = (local: number, seed: number) => {
    const photo = photos.find((img): img is HTMLImageElement => !!img && img.naturalWidth > 0)
    if (photo) {
      const scale = SW / photo.naturalWidth
      const bandH = SH / scale
      const maxY = Math.max(0, photo.naturalHeight - bandH)
      const steps = Math.max(1, Math.floor(maxY / SAMPLES))
      const sy = Math.min(maxY, Math.floor(local * steps) * SAMPLES)
      bctx.imageSmoothingEnabled = true
      bctx.drawImage(photo, 0, sy, photo.naturalWidth, bandH, 0, 0, SW, SH)
      return
    }
    const sheet = sheetFor(seed)
    const maxY = Math.max(0, sheet.height - SH)
    const steps = Math.max(1, Math.floor(maxY / SAMPLES))
    const sy = Math.min(maxY, Math.floor(local * steps * 0.86) * SAMPLES)
    bctx.imageSmoothingEnabled = false
    bctx.drawImage(sheet, 0, sy, SW, SH, 0, 0, SW, SH)
  }

  /* ---- the runner ------------------------------------------------------- */
  const drawRun = (local: number, seed: number) => {
    const base = rows - 1
    const travel = Math.floor(local * 26)
    const gapA = 16 - travel
    const inGap = (col: number) => [gapA, gapA + 22, gapA - 22].some((gap) => Math.abs(col - gap) < 1.5)
    for (let col = 0; col < columns; col += 1) {
      if (inGap(col)) continue
      sample(col, base, 0.3 + ((col + travel) % 3 === 0 ? 0.12 : 0))
      if ((col + travel) % 5 === 0) sample(col, base - 1, 0.16)
    }

    /* he runs just off the seam of the room — the middle of the frame — and the
       chaser follows on the other side of it */
    const hereX = 2
    const distanceToGap = gapA - hereX
    const jump = distanceToGap > -1 && distanceToGap < 5 ? Math.sin(((5 - distanceToGap) / 6) * Math.PI) : 0
    const lift = Math.round(jump * 2)
    const frame = runnerFrames[Math.floor(local * 34) % runnerFrames.length] ?? RUNNER_RUN[0]
    const sprite = lift > 0 ? runnerAir : frame
    paintSprite(sprite, hereX, base - (sprite.length - 1) - lift)
    const hop = distanceToGap > 0 && distanceToGap < 6 ? Math.round(jump * 1.4) : 0
    paintSprite(chaserSprite, hereX - 6, base - (chaserSprite.length - 1) - hop)
  }

  /* ---- the written channels -------------------------------------------- */
  const drawWord = (text: string, local: number, seed: number) => {
    const letters = Array.from(text.toUpperCase()).filter((char) => char !== ' ')
    if (!letters.length) return
    /* short words get letters two screens wide, so the wall has to *combine*
       cells to show them; longer ones fit one screen each */
    const span = letters.length <= 6 ? 2 : 1
    const run = letters.length * span
    const next = rng(seed)
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
      ctx.font = `900 ${Math.round(span * CELL * 0.76)}px ${options.font ?? FONT_STACK}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(letters[i], x(cx) + (span * CELL) / 2, y(row) + (span * CELL) / 2 + span * CELL * 0.03)
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
    const row0 = Math.max(0, Math.floor((rows - rowsTall) / 2))

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
    ...options.channels,
  }
  const programmeFor = (seed: number): Beat[] => {
    const channels = PROGRAMMES[Math.floor(rng(seed + 91)() * PROGRAMMES.length) % PROGRAMMES.length]
    return channels.filter((kind) => weights[kind] > 0).map((kind) => ({ kind, weight: weights[kind] }))
  }

  let pinned: FeedChannel | null = null
  let lastStep = -1
  let lastSeed = Number.NaN
  let lastWord = ''
  let lastPhase = 0
  let lastDuration = 7.2

  const paint = (text: string, seed: number, phase: number) => {
    const t = clamp01(phase)
    /* before the first moment the seed is still NaN — a take of its own is
       painted from a fixed seed so the wall is never asked to play nothing */
    const take = Number.isFinite(seed) ? seed : 0.17
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const programme = pinned
      ? [{ kind: pinned, weight: 1 }]
      : programmeFor(take)
    const total = programme.reduce((sum, beat) => sum + beat.weight, 0) || 1
    let cursor = 0
    programme.forEach((beat, index) => {
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

  /* the letters are drawn in the site's own face: redraw the current take once
     the webfont lands, or the wall writes in a fallback for the whole session */
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
  fonts?.ready?.then(() => {
    paint(lastWord, lastSeed, lastPhase)
  })

  return {
    texture,
    columns,
    rows,
    pin: (channel) => {
      pinned = channel
      lastStep = -1
    },
    update: (word, seed, phase, duration = 7.2) => {
      lastPhase = phase
      lastDuration = duration
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
      texture.dispose()
    },
  }
}
