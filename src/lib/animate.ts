import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import SplitType from 'split-type'

gsap.registerPlugin(ScrollTrigger)

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Split a block into words wrapped in masked lines, ready to slide up. */
export function splitReveal(el: HTMLElement, options: { stagger?: number; y?: string; delay?: number } = {}) {
  if (reduced()) return () => {}
  const split = new SplitType(el, { types: 'lines,words', lineClass: 'split-line', wordClass: 'split-word' })
  const lines = split.lines ?? []
  gsap.set(lines, { overflow: 'hidden' })
  const tl = gsap.timeline({
    scrollTrigger: { trigger: el, start: 'top 88%', once: true },
  })
  tl.from(el.querySelectorAll('.split-word'), {
    yPercent: 118,
    duration: 1,
    ease: 'expo.out',
    stagger: options.stagger ?? 0.035,
    delay: options.delay ?? 0,
  })
  return () => {
    tl.kill()
    split.revert()
  }
}

/** Simple fade + rise for any element. */
export function revealUp(targets: gsap.TweenTarget, options: { y?: number; delay?: number; stagger?: number; trigger?: Element | null } = {}) {
  if (reduced()) {
    gsap.set(targets, { opacity: 1, y: 0 })
    return () => {}
  }
  const tween = gsap.fromTo(
    targets,
    { y: options.y ?? 40, opacity: 0 },
    {
      y: 0,
      opacity: 1,
      duration: 1.05,
      ease: 'expo.out',
      stagger: options.stagger ?? 0.08,
      delay: options.delay ?? 0,
      scrollTrigger: options.trigger
        ? { trigger: options.trigger, start: 'top 85%', once: true }
        : undefined,
    },
  )
  return () => tween.kill()
}

/** Mono "decrypt" effect for small labels. */
export function scramble(el: HTMLElement, finalText: string, duration = 0.7) {
  if (reduced()) {
    el.textContent = finalText
    return () => {}
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\[]—+*#'
  const total = Math.max(1, Math.round(duration * 28))
  let frame = 0
  const id = window.setInterval(() => {
    frame += 1
    const progress = frame / total
    el.textContent = finalText
      .split('')
      .map((c, i) => {
        if (c === ' ') return ' '
        if (i / finalText.length < progress) return c
        return chars[Math.floor(Math.random() * chars.length)]
      })
      .join('')
    if (frame >= total) {
      window.clearInterval(id)
      el.textContent = finalText
    }
  }, 1000 / 28)
  return () => window.clearInterval(id)
}

/**
 * Robust reveal-on-view: adds `.is-in` to `[data-reveal]` descendants.
 * Uses IntersectionObserver (not ScrollTrigger) so content can never get
 * stuck invisible, with a safety pass for anything already on screen.
 */
export function revealOnView(
  root: HTMLElement,
  options: { selector?: string; threshold?: number; delay?: number } = {},
) {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>(options.selector ?? '[data-reveal]'))
  if (!nodes.length) return () => {}

  if (reduced()) {
    nodes.forEach((node) => node.classList.add('is-in'))
    return () => {}
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-in')
        observer.unobserve(entry.target)
      })
    },
    { threshold: options.threshold ?? 0.12, rootMargin: '0px 0px -6% 0px' },
  )
  nodes.forEach((node) => observer.observe(node))

  const safety = window.setTimeout(() => {
    nodes.forEach((node) => {
      if (node.getBoundingClientRect().top < window.innerHeight) node.classList.add('is-in')
    })
  }, options.delay ?? 1400)

  return () => {
    observer.disconnect()
    window.clearTimeout(safety)
  }
}

export { gsap, ScrollTrigger, SplitType }
