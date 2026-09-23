/**
 * Sonde du couple mot + emblème dans le pied de page NévoLabs.
 *
 * Descend en bas de page (deux fois : les images différées allongent le
 * document), puis relève la géométrie réellement rendue — la boîte de la scène,
 * celle du mot, les deux toiles du mur et leur empilement — et écrit une
 * capture de la scène.
 *
 *   node scripts/nv-footer.mjs [url] [label] [width] [height]
 */
import { chromium } from 'playwright-core'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'

const url = process.argv[2] ?? 'http://localhost:3010'
const label = process.argv[3] ?? 'nv-footer'
const width = Number(process.argv[4] ?? 1512)
const height = Number(process.argv[5] ?? 850)
await mkdir('.shots', { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio'],
})
const page = await browser.newPage({ viewport: { width, height } })
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[console]', msg.text().slice(0, 200))
})
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 200)))

await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(2500)

for (let i = 0; i < 2; i += 1) {
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
  await page.waitForTimeout(1400)
}
await page.waitForTimeout(4000)

const state = await page.evaluate(() => {
  const host = document.querySelector('[data-ready]')
  const stage = host ? host.closest('footer > div') : null
  const word = Array.from(document.querySelectorAll('span')).find(
    (node) => node.textContent?.trim().toLowerCase() === 'nevolabs' && node.children.length === 0,
  )
  const box = (node) => {
    if (!node) return null
    const rect = node.getBoundingClientRect()
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      cx: Math.round(rect.left + rect.width / 2),
      cy: Math.round(rect.top + rect.height / 2),
    }
  }
  const canvases = Array.from(document.querySelectorAll('canvas')).map((c) => {
    const rect = c.getBoundingClientRect()
    const wrap = c.parentElement
    const style = wrap ? getComputedStyle(wrap) : null
    return {
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      top: Math.round(rect.top),
      z: style ? style.zIndex : null,
      pos: style ? style.position : null,
      opacity: wrap?.parentElement ? getComputedStyle(wrap.parentElement).opacity : null,
    }
  })
  const wordStyle = word ? getComputedStyle(word) : null
  return {
    ready: host ? host.getAttribute('data-ready') : 'no host',
    viewport: { w: window.innerWidth, h: window.innerHeight },
    scrollY: Math.round(window.scrollY),
    stage: box(stage),
    word: box(word),
    fontSize: wordStyle ? wordStyle.fontSize : null,
    lineHeight: wordStyle ? wordStyle.lineHeight : null,
    canvases,
  }
})

console.log(JSON.stringify(state, null, 2))
await page.screenshot({ path: path.join('.shots', `${label}.png`) })
await browser.close()
