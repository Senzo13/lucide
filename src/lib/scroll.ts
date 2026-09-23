import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

let lenis: Lenis | null = null
let rafId = 0

/** Boot the inertial smooth-scroll and keep GSAP ScrollTrigger in sync. */
export function initSmoothScroll() {
  if (typeof window === 'undefined' || lenis) return lenis

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // Reduced motion: keep the native scroll, GSAP still works off the real
  // scroll position, and `scrollToSection` falls back to scrollIntoView.
  if (reduced) return null

  lenis = new Lenis({
    duration: 1.15,
    lerp: 0.09,
    wheelMultiplier: 1,
    touchMultiplier: 1.6,
    smoothWheel: true,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  })

  lenis.on('scroll', ScrollTrigger.update)

  const tick = (time: number) => {
    lenis?.raf(time * 1000)
    rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)

  return lenis
}

export function destroySmoothScroll() {
  cancelAnimationFrame(rafId)
  lenis?.destroy()
  lenis = null
}

export const getLenis = () => lenis

/** Scroll to a `#section` selector — used by nav, side menu and footer links. */
export function scrollToSection(target: string | HTMLElement, offset = 0) {
  const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target
  if (!el) return
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (lenis) {
    lenis.scrollTo(el, { offset, duration: prefersReduced ? 0 : 1.3 })
  } else {
    el.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' })
  }
}

/**
 * Land on a `#section` in a single frame, with no travel in between. The
 * channel cut uses it while the frame is black: the visitor never sees the
 * page move, they only see the next chapter already running when it clears.
 * `force` is required because the jump happens while the side menu may still
 * have the scroll frozen.
 */
export function jumpToSection(target: string | HTMLElement) {
  const el = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target
  if (!el) return
  if (lenis) {
    lenis.scrollTo(el, { immediate: true, force: true })
    return
  }
  const top = el.getBoundingClientRect().top + window.scrollY
  window.scrollTo({ top, behavior: 'auto' })
}

export function stopScroll(stop: boolean) {
  if (!lenis) return
  if (stop) lenis.stop()
  else lenis.start()
}

export { gsap, ScrollTrigger }
