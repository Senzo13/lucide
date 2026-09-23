/**
 * QA for the channel cut (see `src/components/ChannelWipe.tsx`).
 *
 * Drives the dev server through every flavour of the cut, on desktop and on a
 * phone viewport, plus the reduced-motion path, and reports the things a
 * screenshot cannot: did the page actually land on the destination, did the
 * overlay clean itself up, did anything throw.
 *
 *   node scripts/cut-qa.mjs [url]
 */
import { chromium } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const url = process.argv[2] ?? 'http://localhost:5174'
const outDir = '.shots/cut-qa'
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio'],
})

const results = []

async function run({ label, viewport, reduced = false, variant = null, shotAt = 380 }) {
  const context = await browser.newContext({
    viewport,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  const problems = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`[console] ${msg.text()}`)
  })
  page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`))

  const target = variant ? `${url}/?cut=${variant}` : url
  await page.goto(target, { waitUntil: 'load', timeout: 60000 })
  await page
    .waitForFunction(() => document.body.dataset.locked !== 'true', { timeout: 30000 })
    .catch(() => problems.push('[warn] page stayed locked'))
  await page.waitForTimeout(1400)
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('button, a')).find((n) =>
      /continuer sans son|sans son/i.test((n.textContent || '').trim()),
    )
    if (el instanceof HTMLElement) el.click()
  })
  await page.waitForTimeout(700)

  const before = await page.evaluate(() => Math.round(window.scrollY))
  const visible = (box) => box && box.width > 0 && box.height > 0
  /* the header nav is the canonical trigger; below 900px it collapses into the
     side menu, so the same walk is done through the burger there */
  const anchor = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('header .header__nav-item')).find((n) =>
      /projets/i.test(n.textContent || ''),
    )
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height }
  })
  if (!visible(anchor)) {
    await page.click('.header__burger')
    await page.waitForTimeout(500)
  }
  const menuAnchor = visible(anchor)
    ? anchor
    : await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('.side-menu__item')).find((n) =>
          /projets/i.test(n.textContent || ''),
        )
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height }
      })
  if (!visible(menuAnchor)) {
    problems.push('[warn] no navigation trigger found')
  } else {
    await page.mouse.click(menuAnchor.x, menuAnchor.y)
    await page.waitForTimeout(shotAt)
    const file = path.join(outDir, `${label}.png`)
    await page.screenshot({ path: file })
  }
  await page.waitForTimeout(2200)

  const after = await page.evaluate(() => {
    const cut = document.querySelector('.cut')
    const section = document.querySelector('#projets')
    return {
      scrollY: Math.round(window.scrollY),
      cutVisibility: cut ? getComputedStyle(cut).visibility : null,
      cutOpacity: cut ? Number(getComputedStyle(cut).opacity) : null,
      cutCells: document.querySelectorAll('.cut__cell').length,
      sectionTop: section ? Math.round(section.getBoundingClientRect().top + window.scrollY) : null,
    }
  })

  results.push({ label, before, ...after, problems })
  await context.close()
}

for (const variant of ['word', 'signal', 'cross', 'cut']) {
  await run({ label: `desktop-${variant}`, viewport: { width: 1512, height: 850 }, variant })
}
await run({ label: 'phone-word', viewport: { width: 390, height: 844 }, variant: 'word' })
await run({ label: 'phone-cross', viewport: { width: 390, height: 844 }, variant: 'cross' })
await run({ label: 'reduced-motion', viewport: { width: 1512, height: 850 }, variant: 'word', reduced: true, shotAt: 200 })

console.log(JSON.stringify(results, null, 2))
await browser.close()
