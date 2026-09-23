/**
 * Measures candidate display faces: cap-height, width/cap ratio and the
 * inter-letter rhythm for the string "LUCIDE" at a fixed size.
 * Reference target (measured on the mockup): width/cap ≈ 4.2 – 4.35.
 */
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:5173/.shots/fonttest.html'

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
await page.goto(url, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)

const candidates = [
  { name: 'archivo wdth125 wght900', family: 'ArchivoVar', settings: "'wdth' 125, 'wght' 900" },
  { name: 'archivo wdth100 wght900', family: 'ArchivoVar', settings: "'wdth' 100, 'wght' 900" },
  { name: 'archivo wdth112 wght900', family: 'ArchivoVar', settings: "'wdth' 112, 'wght' 900" },
  { name: 'archivo black', family: 'ArchivoBlack', settings: 'normal' },
  { name: 'inter tight 900', family: 'InterTight', settings: "'wght' 900" },
  { name: 'inter tight 800', family: 'InterTight', settings: "'wght' 800" },
  { name: 'inter 900', family: 'InterVar', settings: "'wght' 900" },
  { name: 'roboto flex wdth110 wght900', family: 'RobotoFlex', settings: "'wdth' 110, 'wght' 900" },
  { name: 'roboto flex wdth120 wght1000', family: 'RobotoFlex', settings: "'wdth' 120, 'wght' 1000" },
  { name: 'geist 900', family: 'GeistVar', settings: "'wght' 900" },
]

const results = await page.evaluate(async (list) => {
  // make sure the extra faces are usable on the measurement page
  const faces = `@font-face{font-family:'InterVar';src:url('/node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2') format('woff2-variations');font-weight:100 900;}
  `
  const style = document.createElement('style')
  style.textContent = faces
  document.head.append(style)
  await document.fonts.ready

  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  const SIZE = 400
  return list.map(({ name, family, settings }) => {
    ctx.font = `${SIZE}px ${family}`
    if ('fontStretch' in ctx) ctx.fontStretch = 'normal'
    if ('fontVariationSettings' in ctx) ctx.fontVariationSettings = settings
    const m = ctx.measureText('LUCIDE')
    const cap = m.actualBoundingBoxAscent
    const single = ctx.measureText('H').width
    return {
      name,
      capHeight: +cap.toFixed(1),
      width: +m.width.toFixed(1),
      ratio: +(m.width / cap).toFixed(3),
      hWidth: +single.toFixed(1),
    }
  })
}, candidates)

console.log(
  JSON.stringify(
    {
      reference: { ratio: 4.24, note: 'measured on the mockup crop: width ≈ 1075px, cap ≈ 253px' },
      results: results
        .map((r) => ({ ...r, deltaFromRef: +(r.ratio - 4.24).toFixed(3) }))
        .sort((a, b) => Math.abs(a.deltaFromRef) - Math.abs(b.deltaFromRef)),
    },
    null,
    2,
  ),
)

await browser.close()
