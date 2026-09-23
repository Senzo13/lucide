/**
 * Visual QA harness — drives the local dev server with the system Chrome and
 * captures screenshots + console/network errors.
 *
 *   node scripts/shot.mjs --url http://localhost:5173 --out .shots --tag hero
 *
 * Options:
 *   --shots  comma separated scroll targets: "top,1200,#projets,bottom"
 *   --w/--h  viewport size (default 1512x850, the reference size)
 */
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const args = process.argv.slice(2)
const getArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const url = getArg('url', 'http://localhost:5173')
const outDir = getArg('out', '.shots')
const tag = getArg('tag', 'shot')
const width = Number(getArg('w', '1512'))
const height = Number(getArg('h', '850'))
const settle = Number(getArg('settle', '4200'))
const targets = getArg('shots', 'top').split(',').map((s) => s.trim()).filter(Boolean)
const mobile = args.includes('--mobile')
/** `ask` keeps the sound-consent bar visible (reference comparison),
 *  `off` answers "continue without sound" so the bar collapses. */
const consent = getArg('consent', 'ask')
/** optional CSS selector to hover before each shot (hover-state QA) */
const hover = getArg('hover', '')
/** ms to wait after the hover before shooting (catch a transition mid-flight) */
const hoverWait = Number(getArg('hoverWait', '900'))
/** optional `x,y,w,h` crop, applied to every shot — for pixel-level QA */
const clipArg = getArg('clip', '')
const clip = clipArg
  ? (([x, y, w, h]) => ({ x: Number(x), y: Number(y), width: Number(w), height: Number(h) }))(clipArg.split(','))
  : undefined
const dsf = Number(getArg('dsf', '1'))
/** `--gpu` renders with the real GPU instead of the software rasteriser —
 *  mandatory for QA of anything animated (SwiftShader runs this page at ~2fps,
 *  so transitions look frozen and reveal animations never complete). */
const useGpu = args.includes('--gpu')

await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: [
    ...(useGpu
      ? ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']
      : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    '--hide-scrollbars',
    '--mute-audio',
    '--force-color-profile=srgb',
  ],
})

const context = await browser.newContext({
  viewport: { width: mobile ? 390 : width, height: mobile ? 844 : height },
  deviceScaleFactor: dsf,
  reducedMotion: 'no-preference',
  isMobile: mobile,
  hasTouch: mobile,
})

const page = await context.newPage()
const problems = []

page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    problems.push(`[console:${msg.type()}] ${msg.text()}`)
  }
})
page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`))
page.on('requestfailed', (req) => problems.push(`[requestfailed] ${req.url()} — ${req.failure()?.errorText}`))

await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(settle)

// wait for the intro overlay to release the page
await page
  .waitForFunction(() => document.body.dataset.locked !== 'true', { timeout: 20000 })
  .catch(() => problems.push('[warn] body stayed locked — intro overlay may not have dismissed'))

const clickByText = (pattern) =>
  page.evaluate((src) => {
    const re = new RegExp(src, 'i')
    const el = Array.from(document.querySelectorAll('button, a')).find((n) => re.test((n.textContent || '').trim()))
    if (el instanceof HTMLElement) {
      el.click()
      return true
    }
    return false
  }, pattern.source)

if (consent === 'off') await clickByText(/continuer sans son|sans son|no sound/)
await page.waitForTimeout(1200)

const report = { url, viewport: mobile ? '390x844' : `${width}x${height}`, shots: [] }

for (const target of targets) {
  if (target === 'top') {
    await page.evaluate(() => window.scrollTo(0, 0))
  } else if (target === 'bottom') {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  } else if (target.startsWith('#')) {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY)
    }, target)
  } else {
    await page.evaluate((y) => window.scrollTo(0, Number(y)), target)
  }
  await page.waitForTimeout(1800)
  if (hover) {
    await page.hover(hover).catch(() => problems.push(`[warn] hover target not found: ${hover}`))
    await page.waitForTimeout(hoverWait)
  }
  const file = path.join(outDir, `${tag}-${target.replace(/[#/]/g, '') || 'top'}.png`)
  await page.screenshot({ path: file, ...(clip ? { clip } : {}) })
  report.shots.push(file)
}

const metrics = await page.evaluate(() => {
  const canvas = document.querySelector('canvas')
  const rect = canvas?.getBoundingClientRect()
  return {
    docHeight: document.body.scrollHeight,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    canvas: rect ? { w: Math.round(rect.width), h: Math.round(rect.height), top: Math.round(rect.top) } : null,
    bodyOverflowX: document.documentElement.scrollWidth > window.innerWidth,
    sections: Array.from(document.querySelectorAll('[data-section]')).map((s) => s.id || '(no id)'),
  }
})

console.log(JSON.stringify({ ...report, metrics, problems: problems.slice(0, 40), problemCount: problems.length }, null, 2))

await browser.close()
