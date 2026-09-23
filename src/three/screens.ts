import * as THREE from 'three'

/**
 * The video wall's feed.
 *
 * The room is a wall of screens, and this is what they show. Everything is
 * painted here, on the CPU, into one canvas that the backdrop samples per
 * cell — which is what makes a *run of cells* able to carry one big letter, or
 * a drawing made of lit squares, or a word that switches off one cell at a
 * time. Doing it in the shader would have meant a hash per cell and a single
 * letter per cell; doing it here means the picture can be composed.
 *
 * The canvas is transparent wherever nothing is being shown, so the wall is
 * left exactly as it was and no cell ever lights up "for nothing".
 */
export const SCREEN_COLS = 22
export const SCREEN_ROWS = 6

const CELL = 56
/** repaints over one moment: the picture re-locks about four times a second */
const STEPS = 34

/** a word, a drawing, a word — each beat appears, holds, then goes out cell by cell */
const BEATS: Array<[number, number, 'word' | 'mark']> = [
  [0, 0.36, 'word'],
  [0.36, 0.68, 'mark'],
  [0.68, 1, 'word'],
]

/** the drawings, as cells: `#` is a lit square, `.` is left alone */
const MARKS: string[][] = [
  ['..#..', '.###.', '#####'],
  ['..#..', '.###.', '#####', '.###.', '..#..'],
  ['..#..', '.###.', '#.#.#', '..#..', '..#..'],
  ['..#..', '#####', '..#..'],
  ['.###.', '#...#', '.###.'],
  ['#####', '#...#', '#####'],
]

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
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  if (!ctx) return null

  const x = (col: number) => col * CELL
  const y = (row: number) => row * CELL

  /** one lit screen: its dark glass and the black frame that separates it
      from the screen next door — the bezel of the video wall */
  const screen = (col: number, row: number) => {
    ctx.fillStyle = '#0c0c11'
    ctx.fillRect(x(col), y(row), CELL, CELL)
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = Math.round(CELL * 0.055)
    ctx.strokeRect(x(col) + ctx.lineWidth / 2, y(row) + ctx.lineWidth / 2, CELL - ctx.lineWidth, CELL - ctx.lineWidth)
  }

  /** a lit square inside one screen (the drawings are made of these) */
  const block = (col: number, row: number) => {
    screen(col, row)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x(col) + CELL * 0.2, y(row) + CELL * 0.2, CELL * 0.6, CELL * 0.6)
  }

  /* ---- the word: one letter per run of cells --------------------------- */
  const drawWord = (word: string, local: number, seed: number) => {
    const letters = Array.from(word.toUpperCase()).filter((char) => char !== ' ')
    if (!letters.length) return
    /* short words get letters two cells wide, so the wall has to *combine*
       cells to show them; longer ones fit one cell each */
    const span = letters.length <= 6 ? 2 : 1
    const run = letters.length * span
    const next = rng(seed)
    const start = Math.floor(next() * Math.max(1, SCREEN_COLS - run + 1))
    const row = span === 2 ? 2 : 3
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
      ctx.fillStyle = '#ffffff'
      ctx.font = `900 ${Math.round(span * CELL * 0.76)}px ${FONT_STACK}`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(letters[i], x(start + i * span) + (span * CELL) / 2, y(row) + (span * CELL) / 2 + span * CELL * 0.03)
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
    const col0 = Math.floor(next() * Math.max(1, SCREEN_COLS - cols + 1))
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

  const paint = (word: string, seed: number, phase: number) => {
    const t = clamp01(phase)
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    BEATS.forEach(([from, to, kind], index) => {
      if (t < from || t >= to) return
      const local = (t - from) / (to - from)
      if (kind === 'word') drawWord(word, local, seed + index * 31)
      else drawMark(local, seed + index * 47)
    })
    texture.needsUpdate = true
  }

  /* the letters are drawn in the site's display face: redraw the current take
     once the webfont lands, or the wall would write in a fallback for the
     whole session */
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
  fonts?.ready?.then(() => {
    const step = Math.round(lastPhase * STEPS) / STEPS
    paint(lastWord, lastSeed, step)
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
 * into `STEPS` frames, so the picture holds still between two of them and the
 * wall reads as a slow, deliberate display instead of a continuous animation.
 */
export function updateScreens(word: string, seed: number, phase: number) {
  if (!painter) return
  lastPhase = phase
  const step = Math.round(clamp01(phase) * STEPS)
  if (step === lastStep && seed === lastSeed && word === lastWord) return
  lastStep = step
  lastSeed = seed
  lastWord = word
  painter.paint(word, seed, step / STEPS)
}
