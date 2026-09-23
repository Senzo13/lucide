import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { site } from '../content/site'
import { jumpToSection } from '../lib/scroll'
import { useAppStore, type ChannelCue } from '../store/useAppStore'
import './ChannelWipe.css'

/* --------------------------------------------------------------------------
   The channel cut.

   Every in-page link on the site fires a cue (see `src/lib/channel.ts`); this
   overlay answers it by covering the frame with a mosaic of black cells for
   about four fifths of a second, jumping the document to the destination
   *while nothing can be seen*, then clearing again on the new chapter.

   It is deliberately built like a broadcast test card rather than a page
   wipe: most cells are dead black, a few carry one letter of the destination,
   a few carry the studio's triangle in the accent colour, a few light up as
   solid blocks of signal. The pattern is redrawn on every cut, so the mosaic
   never plays the same way twice — that is what makes it read as a television
   being tuned.
   -------------------------------------------------------------------------- */

type CellKind = 'void' | 'ghost' | 'beat' | 'letter' | 'tri'
type TriTone = 'red' | 'ink' | 'dim'

type CellPlan = {
  col: number
  row: number
  kind: CellKind
  /** the glyph, for `letter` cells */
  char?: string
  tone?: TriTone
  outline?: boolean
}

type Plan = { cols: number; rows: number; cells: CellPlan[] }

const rand = (n: number) => Math.floor(Math.random() * n)
const chance = (p: number) => Math.random() < p

/** Cell size is picked per viewport: big enough to read as a mosaic, small
    enough that the word can still be spelled across the frame. */
function cellSize(width: number) {
  if (width < 700) return 54
  if (width < 1200) return 72
  return 88
}

function planCells(cue: ChannelCue, cols: number, rows: number): Plan {
  const cells: CellPlan[] = []
  const index = new Map<string, CellPlan>()
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell: CellPlan = { col, row, kind: 'void' }
      cells.push(cell)
      index.set(`${col}:${row}`, cell)
    }
  }

  const at = (col: number, row: number) => {
    if (col < 0 || row < 0 || col >= cols || row >= rows) return undefined
    return index.get(`${col}:${row}`)
  }
  const free = () => cells.filter((cell) => cell.kind === 'void')
  const draw = (count: number, paint: (cell: CellPlan) => void) => {
    for (let i = 0; i < count; i += 1) {
      const pool = free()
      if (!pool.length) return
      paint(pool[rand(pool.length)])
    }
  }
  const scatterTriangles = (count: number, redBias = 0.66) => {
    draw(count, (cell) => {
      cell.kind = 'tri'
      cell.tone = chance(redBias) ? 'red' : chance(0.5) ? 'ink' : 'dim'
      cell.outline = chance(0.38)
    })
  }
  const letterLeft = (cell: CellPlan | undefined, char: string) => {
    if (!cell || cell.kind === 'letter') return
    cell.kind = 'letter'
    cell.char = char
  }

  const word = cue.label.replace(/\s+/g, '').split('')
  const initial = word[0] ?? '·'

  if (cue.variant === 'signal') {
    /* a lit diagonal runs through the frame, as if the picture were rolling */
    const dir = chance(0.5) ? 1 : -1
    const slope = 0.55 + Math.random() * 0.9
    const origin = rand(cols)
    for (let row = 0; row < rows; row += 1) {
      const col = Math.round(origin + dir * row * slope)
      const cell = at(col, row)
      if (cell) cell.kind = 'beat'
      if (row % 3 === 0) {
        const echo = at(col + dir * 2, row)
        if (echo && echo.kind === 'void') echo.kind = 'ghost'
      }
    }
    /* one letter, dropped anywhere on the frame — the diagonal is the subject */
    letterLeft(at(1 + rand(Math.max(1, cols - 2)), 1 + rand(Math.max(1, rows - 2))), initial)
    scatterTriangles(4 + rand(4), 0.8)
    draw(4 + rand(5), (cell) => {
      cell.kind = 'ghost'
    })
  } else if (cue.variant === 'cross') {
    /* a full row and column burn through the mosaic like a test card */
    const row = 1 + rand(Math.max(1, rows - 2))
    const col = 1 + rand(Math.max(1, cols - 2))
    for (let x = 0; x < cols; x += 1) {
      const cell = at(x, row)
      if (cell) cell.kind = 'beat'
    }
    for (let y = 0; y < rows; y += 1) {
      const cell = at(col, y)
      if (cell) cell.kind = 'beat'
    }
    /* the word then runs down the column, on top of the lit cells */
    const offset = Math.max(0, Math.floor((rows - word.length) / 2))
    word.forEach((char, i) => {
      const cell = at(col, Math.min(rows - 1, Math.max(0, offset + i)))
      if (cell) {
        cell.kind = 'letter'
        cell.char = char
      }
    })
    scatterTriangles(6 + rand(5), 0.5)
  } else {
    /* `word`: the destination is spelled across the mosaic, one cell per
       letter — horizontally like a caption, or vertically like a dial */
    const canRunAcross = cols - 2 >= word.length
    const canRunDown = rows - 2 >= word.length
    if (!canRunAcross || (canRunDown && chance(0.34))) {
      const col = 1 + rand(Math.max(1, cols - 2))
      const start = 1 + rand(Math.max(1, rows - word.length - 2))
      word.forEach((char, i) => letterLeft(at(col, start + i), char))
    } else {
      const row = Math.min(rows - 2, Math.max(1, Math.round(rows * (0.28 + Math.random() * 0.36))))
      const start = 1 + rand(Math.max(1, cols - word.length - 1))
      /* one letter — never more — sits a row off the caption: enough to look
         like a broadcast artefact, not enough to break the word */
      const offbeat = chance(0.5) ? rand(word.length) : -1
      word.forEach((char, i) => {
        const jitter = i === offbeat ? (chance(0.5) ? -1 : 1) : 0
        letterLeft(at(start + i, row + jitter), char)
      })
    }
    scatterTriangles(3 + rand(4))
    draw(2 + rand(5), (cell) => {
      cell.kind = 'beat'
    })
    draw(5 + rand(6), (cell) => {
      cell.kind = 'ghost'
    })
  }

  return { cols, rows, cells }
}

const TRIANGLE = 'M50 2 L98 86 L2 86 Z'

export default function ChannelWipe() {
  const cue = useAppStore((s) => s.channel)
  const root = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const host = root.current
    const board = grid.current
    if (!host || !board || !cue) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      jumpToSection(cue.href)
      return
    }

    board.replaceChildren()

    /* the shortest flavour draws no mosaic at all: the frame simply goes black */
    const hard = cue.variant === 'cut'
    const size = cellSize(window.innerWidth)
    const plan = hard
      ? { cols: 0, rows: 0, cells: [] as CellPlan[] }
      : planCells(cue, Math.max(6, Math.round(window.innerWidth / size)), Math.max(4, Math.round(window.innerHeight / size)))

    board.style.gridTemplateColumns = `repeat(${Math.max(1, plan.cols)}, 1fr)`
    board.style.gridTemplateRows = `repeat(${Math.max(1, plan.rows)}, 1fr)`
    host.style.setProperty('--cut-cell', `${window.innerWidth / Math.max(1, plan.cols)}px`)
    host.dataset.variant = cue.variant

    for (const cell of plan.cells) {
      const node = document.createElement('span')
      node.className = 'cut__cell'
      node.dataset.kind = cell.kind
      node.style.gridColumn = String(cell.col + 1)
      node.style.gridRow = String(cell.row + 1)

      if (cell.kind === 'letter') {
        const glyph = document.createElement('span')
        glyph.className = 'cut__letter'
        glyph.textContent = cell.char ?? ''
        node.append(glyph)
      }
      if (cell.kind === 'tri') {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('class', 'cut__tri')
        svg.setAttribute('viewBox', '0 0 100 88')
        svg.dataset.tone = cell.tone ?? 'red'
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        path.setAttribute('d', TRIANGLE)
        path.setAttribute('fill', cell.outline ? 'none' : 'currentColor')
        if (cell.outline) {
          path.setAttribute('stroke', 'currentColor')
          path.setAttribute('stroke-width', '7')
        }
        svg.append(path)
        node.append(svg)
      }
      if (cell.kind === 'beat') {
        const fill = document.createElement('span')
        fill.className = 'cut__fill'
        node.append(fill)
      }
      board.append(node)
    }

    const all = board.querySelectorAll<HTMLElement>('.cut__cell')
    const fills = board.querySelectorAll<HTMLElement>('.cut__fill')
    const letters = board.querySelectorAll<HTMLElement>('.cut__letter')
    const triangles = board.querySelectorAll<SVGElement>('.cut__tri')
    /* the lock read-out is held back until the page has actually moved */
    const chrome = Array.from(host.querySelectorAll<HTMLElement>('.cut__hud > *:not(.cut__state--lock)'))
    const plate = host.querySelector<HTMLElement>('.cut__plate')
    const search = host.querySelector<HTMLElement>('.cut__state--search')
    const lock = host.querySelector<HTMLElement>('.cut__state--lock')

    /* the cells that stutter mid-cut: pure texture, and always the empty ones
       so the word and the triangles stay legible */
    const flicker = Array.from(all)
      .filter((node) => node.dataset.kind === 'void')
      .sort(() => Math.random() - 0.5)
      .slice(0, 18)

    const land = () => {
      jumpToSection(cue.href)
      useAppStore.getState().triggerGlitch()
    }

    const tl = gsap.timeline({
      defaults: { ease: 'power2.out' },
      onComplete: () => {
        gsap.set(host, { autoAlpha: 0, pointerEvents: 'none' })
        board.replaceChildren()
        host.style.removeProperty('--cut-cell')
      },
    })

    /* a chapter swap owns the frame for its whole length: it is the only way
       the page is allowed to swallow a click */
    tl.set(host, { autoAlpha: 1, pointerEvents: 'auto' })

    const cleanup = () => {
      tl.kill()
      board.replaceChildren()
    }

    if (hard) {
      /* hard cut: a black frame, the station ident, straight to the chapter */
      tl.fromTo(chrome, { opacity: 0 }, { opacity: 1, duration: 0.06, stagger: 0.02 }, 0)
      tl.fromTo(plate, { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 0.14 }, 0.02)
      tl.call(land, undefined, 0.3)
      tl.to([plate, chrome], { opacity: 0, duration: 0.12 }, 0.46)
      tl.to(host, { autoAlpha: 0, duration: 0.18 }, 0.52)
      return cleanup
    }

    /* 1. the frame is covered by dead cells, in no particular order */
    tl.set(all, { opacity: 0, scale: 1.14 })
    tl.to(all, { opacity: 1, scale: 1, duration: 0.17, stagger: { amount: 0.13, from: 'random' } }, 0)
    tl.to(chrome, { opacity: 1, duration: 0.14, stagger: 0.05 }, 0.06)
    tl.fromTo(plate, { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: 0.2 }, 0.12)

    /* 2. the picture arrives inside the mosaic: lit cells, then the word.
          The word lands last and holds for a good quarter of a second — it is
          the only thing on screen a visitor is meant to *read*. */
    tl.fromTo(fills, { opacity: 0 }, { opacity: 1, duration: 0.07, ease: 'steps(2)', stagger: { amount: 0.12, from: 'random' } }, 0.16)
    tl.fromTo(
      letters,
      { opacity: 0, scale: 1.3 },
      { opacity: 1, scale: 1, duration: 0.07, ease: 'none', stagger: { amount: 0.18, from: 'start' } },
      0.2,
    )
    tl.fromTo(
      triangles,
      { opacity: 0, yPercent: 22 },
      { opacity: 1, yPercent: 0, duration: 0.07, stagger: { amount: 0.16, from: 'random' } },
      0.22,
    )

    /* 3. the word holds — it is the one thing on the frame a visitor is meant
          to *read* — while the signal keeps stuttering around it */
    tl.to(flicker, { opacity: 0.12, duration: 0.05, repeat: 1, yoyo: true, stagger: { amount: 0.09, from: 'random' } }, 0.56)

    /* 4. the document moves while it is invisible, then the frame clears */
    tl.call(land, undefined, 0.72)
    tl.to(search, { opacity: 0, duration: 0.04 }, 0.73)
    tl.to(lock, { opacity: 1, duration: 0.04 }, 0.75)
    tl.to([...chrome, lock, plate], { opacity: 0, duration: 0.12 }, 0.92)
    tl.to(all, { opacity: 0, scale: 0.92, duration: 0.2, ease: 'power2.in', stagger: { amount: 0.18, from: 'random' } }, 0.95)
    tl.set(host, { autoAlpha: 0, pointerEvents: 'none' }, 1.2)

    return cleanup
  }, [cue])

  return (
    <div className="cut" ref={root} aria-hidden="true" data-variant="idle">
      <div className="cut__grid" ref={grid} />
      <div className="cut__hud">
        <span className="u-mono cut__ident">{cue?.tag ?? ''}</span>
        <span className="u-mono cut__live">
          <i />
          EN DIRECT
        </span>
        <span className="u-mono cut__state cut__state--search">RECHERCHE DU SIGNAL</span>
        <span className="u-mono cut__state cut__state--lock">VERROUILLÉ · {site.version}</span>
        <span className="u-mono cut__spec">60 HZ · 625 LIGNES · PAL</span>
      </div>
      <span className="cut__plate" aria-hidden="true">
        <span className="u-mono cut__plate-brand">{site.name}</span>
        <span className="cut__plate-label">{cue?.label ?? ''}</span>
      </span>
    </div>
  )
}
