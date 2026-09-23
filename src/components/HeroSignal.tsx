import { useEffect } from 'react'
import { site } from '../content/site'
import { useAppStore } from '../store/useAppStore'

/**
 * What the wall writes when nobody is asking it anything.
 *
 * This component renders nothing: it is the clock behind the hero's broadcast
 * moment. Every ten to seventeen seconds, while the key visual is the thing on
 * screen, it publishes a word — the station's own idents — and the backdrop
 * shader spells it across the cells of the room for a few seconds before the
 * picture settles again.
 *
 * It is deliberately *not* bound to the scroll: nothing here fires because the
 * page moved. The room speaks on its own, and the only other thing that talks
 * is a chapter change (see `src/lib/channel.ts`).
 */
const IDENTS = [site.name, 'CANAL 01', 'TEMPS RÉEL', 'SIGNAL', 'STUDIO']

export default function HeroSignal() {
  const loaded = useAppStore((s) => s.loaded)

  useEffect(() => {
    if (!loaded) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    /* QA escape hatch: `?wall=LUCIDE` puts one word on the wall and holds it,
       so the moment can be looked at on its own */
    const requested = new URLSearchParams(window.location.search).get('wall')
    if (requested) {
      useAppStore.getState().writeOnWall(requested, 60)
      return
    }

    let step = 0
    let timer = 0
    const speak = () => {
      const { scroll, worldMode, writeOnWall } = useAppStore.getState()
      /* the wall only speaks while the key visual holds the viewport — down in
         the editorial chapters the room is a background, and it stays quiet */
      if (scroll.heroProgress < 0.62 && worldMode === 'space') {
        /* long enough for the wall to run a word, a drawing and a second word */
        writeOnWall(IDENTS[step % IDENTS.length], 7.2)
        step += 1
      }
      timer = window.setTimeout(speak, 10000 + Math.random() * 7000)
    }
    /* one moment shortly after the intro, so the room is alive from the start */
    timer = window.setTimeout(speak, 2600)
    return () => window.clearTimeout(timer)
  }, [loaded])

  return null
}
