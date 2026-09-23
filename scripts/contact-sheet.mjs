/**
 * Contact sheet — tile a folder of QA screenshots into one page so a whole
 * scroll run can be eyeballed in a single image.
 *
 *   node scripts/contact-sheet.mjs --dir .shots/strip --out .shots/strip/sheet.png --cols 4
 */
import { chromium } from 'playwright-core'
import { readdir, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const getArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const dir = path.resolve(getArg('dir', '.'))
const out = path.resolve(getArg('out', path.join(dir, 'sheet.png')))
const cols = Number(getArg('cols', '4'))
const cellWidth = Number(getArg('w', '620'))

const files = (await readdir(dir))
  .filter((f) => f.endsWith('.png') && !f.includes('sheet'))
  .sort((a, b) => {
    const n = (s) => Number((s.match(/-(\d+)\.png$/) ?? [])[1] ?? NaN)
    return Number.isFinite(n(a)) && Number.isFinite(n(b)) ? n(a) - n(b) : a.localeCompare(b)
  })

if (!files.length) {
  console.error(`no screenshots in ${dir}`)
  process.exit(1)
}

const cells = files
  .map(
    (file) => `<figure><img src="${pathToFileURL(path.join(dir, file)).href}" alt=""><figcaption>${file}</figcaption></figure>`,
  )
  .join('\n')

const sheetPath = path.join(dir, '__sheet.html')
await writeFile(
  sheetPath,
  `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; background: #111; padding: 12px; display: grid;
           grid-template-columns: repeat(${cols}, 1fr); gap: 12px; }
    figure { margin: 0; }
    img { width: 100%; display: block; border: 1px solid #333; }
    figcaption { font: 11px/1.6 ui-monospace, monospace; color: #888; }
  </style>${cells}`,
)

const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: cols * (cellWidth + 12), height: 900 } })
await page.goto(pathToFileURL(sheetPath).href, { waitUntil: 'load' })
await page.waitForTimeout(800)
await mkdir(path.dirname(out), { recursive: true })
await page.screenshot({ path: out, fullPage: true })
await browser.close()
console.log(out)
