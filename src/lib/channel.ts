import { site, type ChannelIdent } from '../content/site'
import { jumpToSection, scrollToSection } from './scroll'
import { useAppStore, type ChannelVariant } from '../store/useAppStore'

/**
 * The channel change between two chapters.
 *
 * Every in-page link on the site goes through `channelCut`: instead of sliding
 * the document (which the reference does *not* do — it swaps the whole frame),
 * the page covers itself with a black mosaic for a beat, jumps to the target
 * while nothing can be seen, and clears again on the new chapter.
 *
 * The flavour is drawn, not fixed: `word` spells the destination across the
 * mosaic, `signal` runs a lit diagonal through it, `cross` burns a full row and
 * column, and `cut` is the short one — a bare black frame with the ident. That
 * mix is what keeps it reading as a television being tuned rather than a
 * page transition being played.
 */
const WEIGHTS: Array<[ChannelVariant, number]> = [
  ['word', 4],
  ['signal', 3],
  ['cross', 2],
  ['cut', 2],
]

const TOTAL_WEIGHT = WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0)
/** the last flavour is never drawn twice in a row */
let lastVariant: ChannelVariant | null = null

const VARIANTS: ChannelVariant[] = ['word', 'signal', 'cross', 'cut']

/**
 * QA escape hatch: `?cut=signal` (or `word`, `cross`, `cut`) pins the flavour
 * so one look can be reviewed on its own, and so `scripts/cut-cast.mjs` can
 * capture all four without reloading between rolls. Without the parameter the
 * cut is drawn at random, which is how it is meant to be experienced.
 */
function pinnedVariant(): ChannelVariant | null {
  if (typeof window === 'undefined') return null
  const requested = new URLSearchParams(window.location.search).get('cut')
  return VARIANTS.find((variant) => variant === requested) ?? null
}

function drawVariant(): ChannelVariant {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let ticket = Math.random() * TOTAL_WEIGHT
    for (const [variant, weight] of WEIGHTS) {
      ticket -= weight
      if (ticket <= 0 && variant !== lastVariant) {
        lastVariant = variant
        return variant
      }
    }
  }
  const fallback: ChannelVariant = lastVariant === 'word' ? 'signal' : 'word'
  lastVariant = fallback
  return fallback
}

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Swap to another chapter of the site through the channel cut. */
export function channelCut(href: string) {
  if (!href.startsWith('#')) {
    scrollToSection(href)
    return
  }

  /* Reduced motion: no mosaic, no black frame — just be there. */
  if (prefersReduced()) {
    jumpToSection(href)
    return
  }

  const id = href.slice(1)
  const ident = (site.channels as Record<string, ChannelIdent | undefined>)[id]
  useAppStore.getState().playChannel({
    href,
    label: ident?.label ?? id.toUpperCase(),
    tag: ident?.tag ?? id.toUpperCase(),
    variant: pinnedVariant() ?? drawVariant(),
  })
}
