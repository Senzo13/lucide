/**
 * Reports the page skeleton: total height in viewports, every section's
 * offset/height, its background and whether it hides the WebGL layer.
 *
 *   node scripts/inspect.mjs [url]
 */
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:5173'

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio'],
})
const page = await browser.newPage({ viewport: { width: 1512, height: 850 } })
await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(7000)
await page.waitForFunction(() => document.body.dataset.locked !== 'true', { timeout: 20000 }).catch(() => {})
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(1500)

const report = await page.evaluate(() => {
  const vh = window.innerHeight
  const sections = Array.from(document.querySelectorAll('main > *, main section, [data-section]'))
  const seen = new Set()
  const rows = []
  for (const el of sections) {
    if (seen.has(el)) continue
    seen.add(el)
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    rows.push({
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      cls: typeof el.className === 'string' ? el.className.slice(0, 60) : '',
      topVh: +(r.top + window.scrollY).toFixed(0) / vh === 0 ? 0 : +(((r.top + window.scrollY) / vh).toFixed(2)),
      heightVh: +((r.height / vh).toFixed(2)),
      background: cs.backgroundColor,
      backgroundImage: cs.backgroundImage.slice(0, 60),
      opacity: cs.opacity,
      transform: cs.transform === 'none' ? 'none' : 'yes',
      dataMode: el.getAttribute('data-mode') || '',
      children: el.children.length,
    })
  }
  const canvases = Array.from(document.querySelectorAll('canvas')).map((c) => {
    const r = c.getBoundingClientRect()
    const host = c.closest('div')
    const cs = host ? getComputedStyle(host) : null
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top),
      hostPosition: cs?.position ?? '',
      hostZ: cs?.zIndex ?? '',
    }
  })
  return {
    docHeightVh: +(document.documentElement.scrollHeight / vh).toFixed(2),
    vh,
    scrollHeight: document.documentElement.scrollHeight,
    sections: rows,
    canvases,
    bodyAttrs: Array.from(document.body.attributes).map((a) => `${a.name}=${a.value}`),
  }
})

console.log(JSON.stringify(report, null, 2))
await browser.close()
