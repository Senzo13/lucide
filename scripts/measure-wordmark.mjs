/**
 * Measures a wordmark in an image by scanning pixels in Chrome:
 * cap-height, width, width/cap ratio, stroke/cap ratio and the vertical
 * position of the cap centre (as a fraction of the image height).
 *
 *   node scripts/measure-wordmark.mjs .shots/ref.png .shots/ours-top.png
 */
import { chromium } from 'playwright-core'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const files = process.argv.slice(2)
if (!files.length) {
  console.error('usage: node scripts/measure-wordmark.mjs <image> [image...]')
  process.exit(1)
}

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
await page.goto('about:blank')

const results = []
for (const file of files) {
  const abs = path.resolve(file)
  const dataUrl = `data:image/png;base64,${(await readFile(abs)).toString('base64')}`
  const metrics = await page.evaluate(async (src) => {
    const img = new Image()
    img.src = src
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0)
    const { data, width: W, height: H } = ctx.getImageData(0, 0, c.width, c.height)

    const lum = (x, y) => {
      const i = (y * W + x) * 4
      return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    }
    // bright, low-saturation pixels = the white wordmark
    const isInk = (x, y) => {
      const i = (y * W + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const mx = Math.max(r, g, b)
      const mn = Math.min(r, g, b)
      return mx > 175 && mx - mn < 60
    }

    const y0 = Math.floor(H * 0.24)
    const y1 = Math.floor(H * 0.78)

    // column profile over the wordmark band
    const cols = new Array(W).fill(0)
    for (let x = 0; x < W; x++) {
      let n = 0
      for (let y = y0; y < y1; y++) if (isInk(x, y)) n++
      cols[x] = n
    }
    // cluster inked columns into words, merging gaps smaller than 4.5% of the
    // width (letter gaps); the widest cluster is the wordmark
    const gapMax = Math.round(W * 0.045)
    const runs = []
    let runStart = -1
    for (let x = 0; x < W; x++) {
      const inked = cols[x] >= 2
      if (inked && runStart < 0) runStart = x
      if ((!inked || x === W - 1) && runStart >= 0) {
        runs.push({ start: runStart, end: x })
        runStart = -1
      }
    }
    const merged = []
    for (const r of runs) {
      const last = merged[merged.length - 1]
      if (last && r.start - last.end <= gapMax) last.end = r.end
      else merged.push({ ...r })
    }
    const bestRun = merged.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a), { start: 0, end: 1 })
    let left = bestRun.start
    let right = bestRun.end - 1

    // cap height measured on the leading "L" only — the crystal sits across the
    // middle of the wordmark and would inflate any full-width row profile
    const capRight = Math.round(left + (right - left) * 0.1)
    let capTop = Infinity
    let capBottom = -Infinity
    for (let y = y0; y < y1; y++) {
      let n = 0
      for (let x = left; x <= capRight; x++) if (isInk(x, y)) n++
      if (n > 2) {
        if (y < capTop) capTop = y
        if (y > capBottom) capBottom = y
      }
    }

    // stroke thickness: first bright run on the mid-cap scanline (the "L" stem)
    const midY = Math.round((capTop + capBottom) / 2)
    let run = 0
    let best = 0
    for (let x = left; x < left + (right - left) * 0.25; x++) {
      if (isInk(x, midY)) {
        run += 1
        best = Math.max(best, run)
      } else if (run > 0) break
    }

    // width measured on the baseline row: by then the right-hand HUD is far
    // above, so the first/last inked pixel really are the "L" and the "E"
    let bLeft = Infinity
    let bRight = -Infinity
    for (let y = capBottom - 10; y <= capBottom - 2; y++) {
      for (let x = 0; x < W; x++) {
        if (isInk(x, y)) {
          if (x < bLeft) bLeft = x
          if (x > bRight) bRight = x
        }
      }
    }
    if (Number.isFinite(bLeft)) {
      left = bLeft
      right = bRight
    }

    const cap = capBottom - capTop
    return {
      size: `${W}x${H}`,
      capHeight: cap,
      capTopPct: +(capTop / H).toFixed(4),
      capCentrePct: +(((capTop + capBottom) / 2 / H)).toFixed(4),
      width: right - left,
      widthPct: +((right - left) / W).toFixed(4),
      leftPct: +(left / W).toFixed(4),
      ratio: +((right - left) / cap).toFixed(3),
      stroke: best,
      strokeRatio: +(best / cap).toFixed(3),
    }
  }, dataUrl)
  results.push({ file: path.relative(process.cwd(), abs), ...metrics })
}

console.log(JSON.stringify(results, null, 2))
await browser.close()
