/**
 * Capture the key visual at a few moments, so the wall can be looked at
 * instead of guessed at.
 *
 *   node scripts/hero-shot.mjs [label] [url] [n] [stepMs]
 *
 * Each shot lands in `.shots/<label>/`. Consent is dismissed the way a
 * visitor does, and the reduced-motion / mobile paths are a separate walk
 * (see `scripts/cut-qa.mjs`).
 */
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const label = process.argv[2] ?? 'hero'
const url = process.argv[3] ?? 'http://localhost:5174'
const count = Number(process.argv[4] ?? 6)
const step = Number(process.argv[5] ?? 900)
/* SHOT_CLIP=x,y,w,h crops every frame to one part of the page (the wall band,
   say), and SHOT_WAIT lets the intro finish first */
const clip = process.env.SHOT_CLIP
  ? (() => {
      const [x, y, width, height] = process.env.SHOT_CLIP.split(',').map(Number)
      return { x, y, width, height }
    })()
  : undefined
const wait = Number(process.env.SHOT_WAIT ?? 0)
const outDir = `.shots/${label}`
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio'],
})
const page = await browser.newPage({ viewport: { width: 1512, height: 850 }, deviceScaleFactor: 1 })
/* SHOT_REDUCE=1 walks the reduced-motion path, where the wall never speaks:
   what is left on screen is the room itself, with no feed on it */
if (process.env.SHOT_REDUCE) await page.emulateMedia({ reducedMotion: 'reduce' })
const problems = []
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`[console] ${msg.text()}`)
})
page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`))

await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(1600)
await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('button, a')).find((n) =>
    /continuer sans son|sans son/i.test((n.textContent || '').trim()),
  )
  if (el instanceof HTMLElement) el.click()
})
await page.mouse.move(756, 300)
await page.waitForTimeout(1200)
if (wait) await page.waitForTimeout(wait)

for (let i = 0; i < count; i += 1) {
  await page.waitForTimeout(i === 0 ? 0 : step)
  await page.screenshot({ path: path.join(outDir, `s${String(i).padStart(2, '0')}.png`), clip })
}

console.log(JSON.stringify({ label, url, shots: count, outDir, problems }, null, 2))
await browser.close()
