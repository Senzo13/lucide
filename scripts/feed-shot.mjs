/**
 * Capture the wall's own feed, straight off the canvas it is painted on —
 * no camera, no perspective, no guesswork.
 *
 *   node scripts/feed-shot.mjs [label] [url] [n] [stepMs]
 */
import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const label = process.argv[2] ?? 'feed'
const url = process.argv[3] ?? 'http://localhost:5174/?wall=LUCIDE&feed=runner'
const count = Number(process.argv[4] ?? 4)
const step = Number(process.argv[5] ?? 700)
const outDir = `.shots/${label}`
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio'],
})
const page = await browser.newPage({ viewport: { width: 1512, height: 850 }, deviceScaleFactor: 1 })
await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(1600)
await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('button, a')).find((n) =>
    /continuer sans son|sans son/i.test((n.textContent || '').trim()),
  )
  if (el instanceof HTMLElement) el.click()
})
await page.mouse.move(756, 300)
await page.waitForTimeout(4000)

for (let i = 0; i < count; i += 1) {
  if (i) await page.waitForTimeout(step)
  const data = await page.evaluate(() => {
    const canvas = window.__feed
    return canvas ? canvas.toDataURL('image/png') : null
  })
  if (!data) {
    console.log('no feed canvas — is the dev server running?')
    break
  }
  await writeFile(path.join(outDir, `f${String(i).padStart(2, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'))
}

console.log(JSON.stringify({ label, url, outDir, shots: count }, null, 2))
await browser.close()
