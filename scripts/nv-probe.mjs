/**
 * Sonde du mur dans le pied de page NévoLabs.
 *
 * Descend en bas de page (deux fois : les images différées allongent le
 * document), puis relève ce qui est réellement monté — combien de canvas, leur
 * géométrie, leur empilement — et écrit une capture de la scène.
 *
 *   node scripts/nv-probe.mjs [url] [outLabel]
 */
import { chromium } from 'playwright-core'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'

const url = process.argv[2] ?? 'http://localhost:3010'
const label = process.argv[3] ?? 'nv-probe'
await mkdir('.shots', { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio'],
})
const page = await browser.newPage({ viewport: { width: 1512, height: 850 } })
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[console]', msg.text().slice(0, 200))
})
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 200)))
page.on('requestfailed', (req) => console.log('[reqfail]', req.url().slice(0, 140)))

await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(2500)

for (let i = 0; i < 2; i += 1) {
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
  await page.waitForTimeout(1400)
}
await page.waitForTimeout(4000)

const state = await page.evaluate(() => {
  const host = document.querySelector('[data-ready]')
  const canvases = Array.from(document.querySelectorAll('canvas')).map((c) => {
    const box = c.getBoundingClientRect()
    const wrap = c.parentElement
    return {
      w: Math.round(box.width),
      h: Math.round(box.height),
      top: Math.round(box.top),
      z: wrap ? getComputedStyle(wrap).zIndex : null,
      pos: wrap ? getComputedStyle(wrap).position : null,
      opacity: wrap ? getComputedStyle(wrap).opacity : null,
    }
  })
  return {
    ready: host ? host.getAttribute('data-ready') : 'no host',
    scrollY: Math.round(window.scrollY),
    canvases,
  }
})

console.log(JSON.stringify(state, null, 2))
await page.screenshot({ path: path.join('.shots', `${label}.png`) })
await browser.close()
