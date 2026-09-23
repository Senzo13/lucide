/**
 * Reference study, wheel-driven.
 *
 * `ref-scroll.mjs` teleports with `window.scrollTo`, which is fine for a plain
 * document and useless for a reference whose whole choreography is fed by a
 * smooth-scroll provider (Lenis and friends): the jump skips the scroll
 * triggers, the 3D carousel never turns, and the frames you get back are not
 * the frames a human sees. This variant drives the page the way a hand does —
 * discrete wheel ticks, with dwell time between them — so every scroll-driven
 * passage actually runs on camera.
 *
 *   node scripts/ref-wheel.mjs [url] [outDir] [stops]
 */
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const url = process.argv[2] ?? 'https://alche.studio/'
const outDir = process.argv[3] ?? '.shots/ref-wheel'
const stops = Number(process.argv[4] ?? 14)

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio'],
})
const page = await browser.newPage({ viewport: { width: 1512, height: 850 }, deviceScaleFactor: 1 })
const problems = []
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`))

await page.goto(url, { waitUntil: 'load', timeout: 120000 })
/* the preloader is a real, long beat on this site — let it finish */
await page.waitForTimeout(9000)

const dismiss = await page.evaluate(() => {
  const texts = ['サウンドなしで進む', 'サウンドをオンにする', 'skip', 'close', 'no sound']
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
await page.waitForTimeout(3000)

await page.mouse.move(756, 425)

const report = { url, stoppedWith: dismiss, stops: [] }
const perStop = Math.ceil((await page.evaluate(() => document.documentElement.scrollHeight)) / stops)

for (let i = 0; i < stops; i += 1) {
  /* three wheel ticks per stop: one big jump is exactly what we are avoiding */
  for (let tick = 0; tick < 3; tick += 1) {
    await page.mouse.wheel(0, Math.round(perStop / 3))
    await page.waitForTimeout(220)
  }
  await page.waitForTimeout(2600)
  const file = path.join(outDir, `w-${String(i + 1).padStart(2, '0')}.png`)
  await page.screenshot({ path: file })
  const y = await page.evaluate(() => Math.round(window.scrollY))
  const section = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)
    return el?.closest('section, [class*="Section"]')?.className?.toString?.().slice(0, 80) ?? ''
  })
  report.stops.push({ file, y, section })
}

console.log(JSON.stringify({ ...report, problems }, null, 2))
await browser.close()
