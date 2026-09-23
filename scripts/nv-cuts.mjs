/**
 * Un canal à la fois, en gros plan.
 *
 * `?feed=<canal>` épingle une prise (le mur ne la quitte plus), mais il faut
 * tomber *au milieu* de la prise pour la juger : la sonde attend donc que la
 * phase soit entre 0,5 et 0,7, puis relève deux choses — ce que le mur a
 * réellement peint (le canevas du feed, écrit dans `.shots/canvases/<canal>.png`)
 * et ce que le cadre en montre (`.shots/canvases/<canal>-page.png`). C'est le
 * seul couple qui dit si un dessin est juste : le canevas dit *ce que le mur
 * écrit*, la page dit *ce qu'on en voit*.
 *
 *   node scripts/nv-cuts.mjs mario,pac,wipe,video
 */
import { chromium } from 'playwright-core'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
const channels = process.argv[2] ? process.argv[2].split(',') : ['mario','pac']
await mkdir('.shots/canvases', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle','--use-angle=d3d11','--ignore-gpu-blocklist','--hide-scrollbars','--mute-audio'] })
for (const ch of channels) {
  const page = await browser.newPage({ viewport: { width: 1512, height: 850 } })
  page.on('pageerror', (e) => console.log('[pageerror]', ch, String(e).slice(0,200)))
  await page.goto('http://localhost:3010/?wall=1&feed=' + ch, { waitUntil: 'load', timeout: 60000 })
  await page.waitForTimeout(1200)
  for (let i = 0; i < 2; i += 1) { await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })); await page.waitForTimeout(1000) }
  let t = -1
  for (let i = 0; i < 70; i += 1) {
    t = await page.evaluate(() => { const w = window.__wall; return w && w.momentT !== null ? w.momentT : -1 })
    if (t > 0.5 && t < 0.7) break
    await page.waitForTimeout(350)
  }
  const info = await page.evaluate(() => {
    const w = window.__wall
    const c = window.__wallFeed
    return { beat: w ? w.beat : null, t: w ? +(w.momentT ?? -1).toFixed(3) : null, url: c ? c.toDataURL('image/png') : null }
  })
  if (info.url) await writeFile(path.join('.shots/canvases', ch + '.png'), Buffer.from(info.url.split(',')[1], 'base64'))
  const box = await page.evaluate(() => { const host = document.querySelector('[data-ready]'); const r = host.closest('footer > div').getBoundingClientRect(); return { x: 0, y: Math.round(r.top), width: window.innerWidth, height: Math.round(r.height) } })
  await page.screenshot({ path: path.join('.shots/canvases', ch + '-page.png'), clip: box })
  console.log(ch, info.beat, info.t)
  await page.close()
}
await browser.close()
