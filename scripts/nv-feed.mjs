/**
 * Chronologie du mur dans le pied de page NévoLabs.
 *
 * Le mur ne se juge pas sur une capture : il faut voir ce qu'il diffuse dans
 * le temps. La sonde échantillonne la bande à intervalle régulier, mesure pour
 * chaque prise la part de pixels *allumés* (le verre noir des écrans et le
 * blanc de ce qu'ils montrent), et écrit une planche-contact des cases.
 *
 *   node scripts/nv-feed.mjs [url] [label] [width] [height] [secondes]
 */
import { chromium } from 'playwright-core'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'

const url = process.argv[2] ?? 'http://localhost:3010'
const label = process.argv[3] ?? 'nv-feed'
const width = Number(process.argv[4] ?? 1512)
const height = Number(process.argv[5] ?? 850)
const seconds = Number(process.argv[6] ?? 24)
await mkdir(path.join('.shots', label), { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio'],
})
const page = await browser.newPage({ viewport: { width, height } })
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 160)))
await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(2000)
for (let i = 0; i < 2; i += 1) {
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
  await page.waitForTimeout(1200)
}
await page.waitForTimeout(2500)

const stage = await page.evaluate(() => {
  const host = document.querySelector('[data-ready]')
  const box = host.closest('footer > div').getBoundingClientRect()
  return { x: 0, y: Math.round(box.top), width: window.innerWidth, height: Math.round(box.height) }
})

const frames = Math.max(1, Math.round(seconds / 1.5))
for (let i = 0; i < frames; i += 1) {
  await page.screenshot({
    path: path.join('.shots', label, `f${String(i).padStart(2, '0')}.png`),
    clip: { x: stage.x, y: stage.y, width: stage.width, height: stage.height },
  })
  await page.waitForTimeout(1500)
}

console.log(JSON.stringify({ label, stage, frames, seconds }, null, 2))
await browser.close()
