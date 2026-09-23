/**
 * Isole l'emblème du pied de page NévoLabs.
 *
 * Le N de verre vit seul dans le second calque du mur. On éteint tout le reste
 * de la scène (mur, visuel de repli, voiles, mot de la marque), on photographie,
 * puis on éteint aussi l'emblème et on photographie de nouveau : la différence
 * des deux images *est* l'emblème, et sa boîte donne son centre réel — à
 * comparer à celui du mot, relevé dans le DOM.
 *
 *   node scripts/nv-emblem.mjs [url] [label] [width] [height]
 */
import { chromium } from 'playwright-core'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'

const url = process.argv[2] ?? 'http://localhost:3010'
const label = process.argv[3] ?? 'nv-emblem'
const width = Number(process.argv[4] ?? 390)
const height = Number(process.argv[5] ?? 844)
await mkdir('.shots', { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--hide-scrollbars', '--mute-audio'],
})
const page = await browser.newPage({ viewport: { width, height } })
await page.goto(url, { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(2500)
for (let i = 0; i < 2; i += 1) {
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
  await page.waitForTimeout(1400)
}
await page.waitForTimeout(4000)

const geometry = await page.evaluate(() => {
  const host = document.querySelector('[data-ready]')
  const stage = host.closest('footer > div')
  const wallRoot = host.firstElementChild
  const canvases = Array.from(document.querySelectorAll('canvas'))
  /* le calque de l'emblème est le *fils direct* du cadre du mur : entre les deux
     il y a le conteneur interne de la toile, posé par react-three-fiber */
  const childOf = (node, root) => {
    let current = node
    while (current.parentElement && current.parentElement !== root) current = current.parentElement
    return current
  }
  const front = childOf(canvases[1], wallRoot)
  const word = Array.from(document.querySelectorAll('span')).find(
    (node) => node.textContent?.trim().toLowerCase() === 'nevolabs' && node.children.length === 0,
  )
  /* tout ce qui n'est pas l'emblème s'éteint : le fond redevient le blanc de la
     page, et le N reste seul à peindre */
  const off = [
    ...Array.from(wallRoot.children).filter((node) => node !== front),
    stage.querySelector('picture'),
    ...Array.from(stage.querySelectorAll(':scope > span, :scope > div > span')),
  ].filter(Boolean)
  /* trois états : tout, l'emblème seul, rien — c'est la comparaison des deux
     derniers qui donne la boîte du N, sur le blanc de la page */
  window.__nvShow = (state) => {
    const all = state === 'all'
    off.forEach((node) => { node.style.visibility = all ? '' : 'hidden' })
    front.style.visibility = state === 'none' ? 'hidden' : ''
    /* le verre a besoin d'un fond : sans lui il se dissout dans le blanc de la
       page (ses calques s'ajoutent). On le fait poser sur un gris neutre, qui
       ne bouge pas d'une prise à l'autre — la différence des deux images est
       donc bien l'emblème, et rien d'autre. */
    wallRoot.style.background = all ? '' : '#6b7484'
  }
  window.__nvShow('all')
  const box = (node) => {
    const rect = node.getBoundingClientRect()
    return {
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      cx: Math.round(rect.left + rect.width / 2),
      cy: Math.round(rect.top + rect.height / 2),
    }
  }
  return { stage: box(stage), word: box(word), hidden: off.length }
})

/* l'emblème d'abord : une toile cachée ne se repeint pas toujours, donc on la
   photographie avant de l'éteindre */
await page.evaluate(() => window.__nvShow('only-emblem'))
await page.waitForTimeout(140)
await page.screenshot({ path: path.join('.shots', `_${label}-avec.png`) })
await page.evaluate(() => window.__nvShow('none'))
await page.waitForTimeout(140)
await page.screenshot({ path: path.join('.shots', `_${label}-sans.png`) })
await page.evaluate(() => window.__nvShow('all'))

console.log(JSON.stringify({ ...geometry, viewport: { width, height } }, null, 2))
await browser.close()
