/**
 * Reference study — loads alche.studio in the system Chrome, dismisses the
 * sound prompt, then captures the page at regular scroll fractions so the
 * scroll choreography can be reproduced faithfully.
 *
 *   node scripts/ref-scroll.mjs [url] [outDir]
 */
import { chromium } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const url = process.argv[2] ?? 'https://alche.studio/'
const outDir = process.argv[3] ?? '.shots/ref'

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--mute-audio'],
})
const page = await browser.newPage({ viewport: { width: 1512, height: 850 }, deviceScaleFactor: 1 })
const problems = []
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`))

await page.goto(url, { waitUntil: 'load', timeout: 90000 })
await page.waitForTimeout(6000)

// dismiss the japanese sound consent + any intro overlay
await page.evaluate(() => {
  const texts = ['サウンドなしで進む', 'サウンドをオンにする', 'skip', 'close']
  const nodes = Array.from(document.querySelectorAll('button, a, [role="button"]'))
  for (const t of texts) {
    const el = nodes.find((n) => (n.textContent || '').trim().includes(t))
    if (el instanceof HTMLElement) {
      el.click()
      return
    }
  }
})
await page.waitForTimeout(4000)

const structure = await page.evaluate(() => {
  const pick = (sel) =>
    Array.from(document.querySelectorAll(sel)).slice(0, 60).map((el) => {
      const r = el.getBoundingClientRect()
      return {
        tag: el.tagName.toLowerCase(),
        cls: el.className && typeof el.className === 'string' ? el.className.slice(0, 90) : '',
        id: el.id || '',
        top: Math.round(r.top + window.scrollY),
        height: Math.round(r.height),
        position: getComputedStyle(el).position,
      }
    })
  return {
    docHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    bodyAttrs: Array.from(document.body.attributes).map((a) => `${a.name}=${a.value}`),
    canvases: Array.from(document.querySelectorAll('canvas')).map((c) => {
      const r = c.getBoundingClientRect()
      const s = getComputedStyle(c.parentElement ?? c)
      return { w: Math.round(r.width), h: Math.round(r.height), parentPosition: s.position, parentZ: s.zIndex, style: c.getAttribute('style')?.slice(0, 160) ?? '' }
    }),
    sections: pick('section, [class*="Section"], [class*="section"]'),
    mainChildren: pick('main > *, body > div > *'),
  }
})

const fractions = [0, 0.04, 0.08, 0.12, 0.18, 0.25, 0.32, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]
const shots = []
for (const f of fractions) {
  await page.evaluate((frac) => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo(0, Math.round(max * frac))
  }, f)
  await page.waitForTimeout(2200)
  const file = path.join(outDir, `ref-${String(Math.round(f * 100)).padStart(3, '0')}.png`)
  await page.screenshot({ path: file })
  shots.push(file)
}

const after = await page.evaluate(() => ({
  bodyAttrs: Array.from(document.body.attributes).map((a) => `${a.name}=${a.value}`),
  docHeight: document.documentElement.scrollHeight,
}))

await writeFile(path.join(outDir, 'structure.json'), JSON.stringify({ url, structure, after, shots, problems }, null, 2))

console.log(JSON.stringify({ docHeight: structure.docHeight, canvases: structure.canvases, problems, shots: shots.length, mainChildren: structure.mainChildren?.slice(0, 24) }, null, 2))

await browser.close()
