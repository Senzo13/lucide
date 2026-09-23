/**
 * Burst-capture a transition on the reference.
 *
 * `page.screenshot()` costs ~500ms on a heavy WebGL page, so it always misses
 * the mosaic. This taps the Chrome DevTools screencast instead (~20-30 fps)
 * and writes every frame to disk, so the channel-change cells can actually be
 * looked at.
 *
 *   node scripts/ref-cast.mjs [url] [navLabel] [ms]
 */
import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const url = process.argv[2] ?? 'https://alche.studio/'
const navLabel = process.argv[3] ?? 'Works'
const duration = Number(process.argv[4] ?? 4000)
const outDir = `.shots/cast-${navLabel.toLowerCase()}`

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio'],
})
const page = await browser.newPage({ viewport: { width: 1512, height: 850 } })
await page.goto(url, { waitUntil: 'load', timeout: 120000 })
await page
  .waitForFunction(
    () => {
      const el = document.querySelector('#loading-overlay, [class*="Loading__container"]')
      if (!el) return true
      const s = getComputedStyle(el)
      return s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05
    },
    { timeout: 90000 },
  )
  .catch(() => {})
await page.evaluate(() => {
  const texts = ['サウンドなしで進む', 'サウンドをオンにする', 'no sound', 'skip']
  const nodes = Array.from(document.querySelectorAll('button, a, [role="button"]'))
  for (const t of texts) {
    const el = nodes.find((n) => (n.textContent || '').trim().includes(t))
    if (el instanceof HTMLElement) {
      el.click()
      return
    }
  }
})
await page.waitForTimeout(3500)
await page.mouse.move(756, 425)

const target = await page.evaluate((label) => {
  const nodes = Array.from(document.querySelectorAll('a, button, [role="button"]'))
  const el = nodes.find((n) => new RegExp(label, 'i').test((n.textContent || '').trim()))
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
}, navLabel)

if (!target) {
  console.log(`nav "${navLabel}" introuvable`)
  await browser.close()
  process.exit(0)
}

await page.mouse.move(target.x, target.y)
await page.waitForTimeout(600)

const cdp = await page.context().newCDPSession(page)
const writes = []
let index = 0
const started = Date.now()

cdp.on('Page.screencastFrame', async (frame) => {
  const t = Date.now() - started
  const file = path.join(outDir, `c${String(index).padStart(3, '0')}-${String(t).padStart(4, '0')}ms.jpg`)
  index += 1
  writes.push(writeFile(file, Buffer.from(frame.data, 'base64')))
  await cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {})
})

await cdp.send('Page.startScreencast', {
  format: 'jpeg',
  quality: 82,
  maxWidth: 1512,
  maxHeight: 850,
  everyNthFrame: 1,
})

await page.mouse.down()
await page.mouse.up()
await page.waitForTimeout(duration)
await cdp.send('Page.stopScreencast').catch(() => {})
await Promise.all(writes)

console.log(JSON.stringify({ url, navLabel, target, frames: index, durationMs: Date.now() - started, outDir }, null, 2))

await browser.close()
