/**
 * What does the reference actually do when you scroll?
 *
 * Walks the page with wheel ticks and, at every stop, records the elements
 * that carry a live 3D transform — their translate X, their rendered X and the
 * scroll position. Comparing stops answers the question a screenshot cannot:
 * is the page scrolling *down*, or is it staying put while things slide
 * *sideways*?
 *
 *   node scripts/ref-probe.mjs [url] [stops]
 */
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'https://alche.studio/'
const stops = Number(process.argv[3] ?? 12)

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
await page.waitForTimeout(3000)
await page.mouse.move(756, 425)

const sample = () =>
  page.evaluate(() => {
    const readable = (el) => {
      const cls = el.className
      if (typeof cls !== 'string' || !cls) return el.tagName.toLowerCase()
      return `${el.tagName.toLowerCase()}.${cls.trim().split(/\s+/).slice(0, 2).join('.')}`
    }
    const rows = []
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const style = getComputedStyle(el)
      const t = style.transform
      if (!t || t === 'none') continue
      const m = t.startsWith('matrix3d')
        ? t.slice(9, -1).split(',').map(Number)
        : t.slice(7, -1).split(',').map(Number)
      const is3d = t.startsWith('matrix3d')
      /* m[12] / m[13] are the translateX / translateY of either matrix form */
      const tx = is3d ? m[12] : m[4]
      const ty = is3d ? m[13] : m[5]
      const r = el.getBoundingClientRect()
      if (Math.abs(tx) < 1 && Math.abs(ty) < 1) continue
      if (r.width < 120 || r.height < 120) continue
      rows.push({
        el: readable(el),
        mode: is3d ? '3d' : '2d',
        tx: Math.round(tx),
        ty: Math.round(ty),
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      })
    }
    return {
      scrollY: Math.round(window.scrollY),
      docH: document.documentElement.scrollHeight,
      viewportH: window.innerHeight,
      rows: rows.slice(0, 24),
    }
  })

const stopsOut = []
for (let i = 0; i <= stops; i += 1) {
  const data = await sample()
  stopsOut.push({ stop: i, ...data })
  for (let tick = 0; tick < 6; tick += 1) {
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(160)
  }
  await page.waitForTimeout(1400)
}

/* which elements moved sideways across the walk? */
const travel = new Map()
for (const s of stopsOut) {
  for (const row of s.rows) {
    const entry = travel.get(row.el) ?? { el: row.el, first: row, last: row, dx: 0, dy: 0 }
    if (row.tx !== entry.last.tx || row.x !== entry.last.x) {
      entry.last = row
      entry.dx = row.x - entry.first.x
      entry.dy = row.y - entry.first.y
    }
    travel.set(row.el, entry)
  }
}

console.log(`url ${url}`)
console.log(`scrollY : ${stopsOut.map((s) => s.scrollY).join(' → ')}`)
console.log(`docH    : ${stopsOut[0].docH}  (viewport ${stopsOut[0].viewportH})`)
console.log('\nmouvements par élément (x = horizontal, y = vertical) :')
for (const { el, dx, dy } of [...travel.values()].sort((a, b) => Math.abs(b.dx) - Math.abs(a.dx))) {
  console.log(`  ${String(dx).padStart(6)}px en X   ${String(dy).padStart(6)}px en Y   ${el}`)
}

await browser.close()
