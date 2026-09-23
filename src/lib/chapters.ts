/**
 * Shared choreography of the pinned chapters.
 *
 * `App.tsx` publishes one raw 0 → 1 progress per pinned section (how far the
 * viewport has travelled inside it). Both the DOM caption and the WebGL scene
 * have to agree on *which* project that progress puts in front of the camera —
 * this is the single place that mapping lives, so the caption can never drift
 * away from the banner it describes.
 */

/** dead run-in before the carousel starts turning */
export const CAROUSEL_IN = 0.07
/** the carousel has reached its last banner here */
export const CAROUSEL_OUT = 0.86

/** 0 → 1 position inside the carousel, from the chapter's raw progress */
export function carouselT(raw: number): number {
  const t = (raw - CAROUSEL_IN) / (CAROUSEL_OUT - CAROUSEL_IN)
  return Math.min(1, Math.max(0, t))
}

/**
 * Position of the carousel along its arc, in banners: `2.0` means the third
 * banner is dead centre, `2.5` means it is halfway to the fourth. The move
 * between two banners is compressed into the middle of each step and then held,
 * so a banner *rests* in front of the camera instead of constantly sliding —
 * and the caption always describes something that is actually centred.
 */
export function carouselS(raw: number, count: number): number {
  if (count <= 1) return 0
  const span = count - 1
  const position = carouselT(raw) * span
  const base = Math.floor(Math.min(span - 0.0001, position))
  const local = position - base
  const eased =
    local <= 0.28
      ? 0
      : local >= 0.72
        ? 1
        : (() => {
            const x = (local - 0.28) / 0.44
            return x * x * (3 - 2 * x)
          })()
  return base + eased
}

/** which banner is in front, for a chapter of `count` projects */
export function carouselIndex(raw: number, count: number): number {
  if (count <= 1) return 0
  return Math.round(carouselS(raw, count))
}

/** 0 → 1 presence of the whole carousel (fades in on arrival, out on exit) */
export function carouselPresence(raw: number): number {
  const fadeIn = Math.min(1, Math.max(0, raw / 0.05))
  const fadeOut = 1 - Math.min(1, Math.max(0, (raw - 0.9) / 0.08))
  return Math.min(1, fadeIn) * Math.max(0, fadeOut)
}
