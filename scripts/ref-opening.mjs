/**
 * The opening passage of the reference, captured densely.
 *
 * The first screens of alche.studio are not a document you scroll down: the
 * preloader holds, then scroll *doesn't* move the page — it drives cards
 * through the key visual while the hero stays pinned. Coarse stop-based
 * captures (or `window.scrollTo` teleports) photograph the preloader and then
 * land past the whole passage. This walks the opening with small wheel ticks
 * and keeps a frame per tick group, so the cards are on film.
 *
 *   node scripts/ref-opening.mjs [url] [outDir] [frames]
 */
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const url = process.argv[2] ?? 'https://alche.studio/'
const outDir = process.argv[3] ?? '.shots/ref-opening'
const frames = Number(process.argv[4] ?? 30)

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio'],
})
const page = await browser.newPage({ viewport: { width: 1512, height: 850 }, deviceScaleFactor: 1 })
const problems = []
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`))

await page.goto(url, { waitUntil: 'load', timeout: 120000 })

/* Wait for the real end of the preloader instead of guessing a dwell time:
   `#loading-overlay` is the reference's own loading container. */
const preloaderGone = await page
  .waitForFunction(
    () => {
      const el = document.querySelector('#loading-overlay, [class*="Loading__container"]')
      if (!el) return true
      const s = getComputedStyle(el)
      return s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05
    },
    { timeout: 90000 },
  )
  .then(() => true)
  .catch(() => false)

/* answer the sound prompt if it is up — it is a modal gate, not a decoration */
const answer = await page.evaluate(() => {
  const texts = ['サウンドなしで進む', 'サウンドをオンにする', 'no sound', 'skip', 'close']
  const nodes = Array.from(document.querySelectorAll('button, a, [role="button"]'))
  for (const t of texts) {
    const el = nodes.find((n) => (n.textContent || '').trim().includes(t))
    if (el instanceof HTMLElement) {
      el.click()
      return t
    }
  }
  return null
})
await page.waitForTimeout(2500)
await page.mouse.move(756, 425)

const y0 = await page.evaluate(() => Math.round(window.scrollY))
const shots = []
for (let i = 1; i <= frames; i += 1) {
  await page.mouse.wheel(0, 150)
  await page.waitForTimeout(900)
  const file = path.join(outDir, `o-${String(i).padStart(2, '0')}.png`)
  await page.screenshot({ path: file })
  const y = await page.evaluate(() => Math.round(window.scrollY))
  shots.push({ file, y })
}

console.log(
  JSON.stringify(
    {
      url,
      preloaderGone,
      answeredSoundPromptWith: answer,
      yBefore: y0,
      yAfter: shots[shots.length - 1]?.y,
      movedPixels: (shots[shots.length - 1]?.y ?? 0) - y0,
      problems,
    },
    null,
    2,
  ),
)

await browser.close()
