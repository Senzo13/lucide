/**
 * Scroll reel — captures our site at the same scroll fractions as the
 * reference study (`scripts/ref-scroll.mjs`) so the two reels can be compared
 * frame by frame.
 *
 *   node scripts/reel.mjs [url] [outDir] [fractions]
 */
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const url = process.argv[2] ?? 'http://localhost:5173'
const outDir = process.argv[3] ?? '.shots/ours'
const fractions = (process.argv[4] ?? '0,0.04,0.08,0.12,0.18,0.25,0.32,0.4,0.5,0.6,0.7,0.8,0.9,1')
  .split(',')
  .map(Number)

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio'],
})
const page = await browser.newPage({ viewport: { width: 1512, height: 850 }, deviceScaleFactor: 1 })
const problems = []
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`[console] ${m.text()}`)
})

await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(6000)
await page
  .waitForFunction(() => document.body.dataset.locked !== 'true', { timeout: 20000 })
  .catch(() => problems.push('[warn] intro overlay kept the page locked'))

const shots = []
const modes = []
for (const f of fractions) {
  await page.evaluate((frac) => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo(0, Math.round(max * frac))
  }, f)
  await page.waitForTimeout(2000)
  const state = await page.evaluate(() => {
    const active = document.querySelector('[data-section]')
    return {
      active: document.querySelector('[data-active="true"]')?.id ?? null,
      world: document.body.dataset.world ?? null,
      sample: active?.id ?? null,
    }
  })
  const file = path.join(outDir, `ours-${String(Math.round(f * 100)).padStart(3, '0')}.png`)
  await page.screenshot({ path: file })
  shots.push(file)
  modes.push({ f, ...state })
}

const metrics = await page.evaluate(() => ({
  docHeight: document.documentElement.scrollHeight,
  viewports: +(document.documentElement.scrollHeight / window.innerHeight).toFixed(1),
}))

console.log(JSON.stringify({ url, metrics, modes, shots: shots.length, problems: problems.slice(0, 20) }, null, 2))
await browser.close()
