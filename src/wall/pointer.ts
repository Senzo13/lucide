import { useEffect } from 'react'

/**
 * Shared normalised pointer (-1 → 1) used by every 3D layer for parallax and
 * by the wall's hover field. Part of the exportable wall (see
 * `src/wall/README.md`).
 * Kept outside of React state on purpose: it is read inside rAF loops only.
 */
export const pointer = {
  x: 0,
  y: 0,
  tx: 0,
  ty: 0,
  /** false while the cursor is outside the window: the wall stops answering */
  inside: false,
  /**
   * L'emprise : le visiteur tient l'objet et le déplace. `x`/`y` sont des
   * fractions de la demi-boîte (-1 = bord gauche/bas, 1 = bord droit/haut), et
   * ils reviennent à zéro quand la main lâche — l'objet se repose de lui-même.
   *
   * C'est le même geste que la pierre de lucide : on appuie sur l'objet, on le
   * promène, on le lâche. La souris et le doigt passent par les mêmes
   * événements de pointeur, donc il n'y a rien à faire de plus pour le tactile.
   */
  grab: {
    /** true pendant que la main tient l'objet */
    active: false,
    x: 0,
    y: 0,
  },
}

export function useGlobalPointer() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    /* one set of listeners for the whole page, however many 3D layers ask for
       it: the pointer is a shared instrument, not a per-component one */
    listeners += 1
    if (listeners > 1) {
      return () => {
        listeners -= 1
      }
    }

    const onMove = (event: PointerEvent) => {
      pointer.tx = (event.clientX / window.innerWidth) * 2 - 1
      pointer.ty = -((event.clientY / window.innerHeight) * 2 - 1)
      pointer.inside = true
    }
    const onLeave = () => {
      pointer.tx = 0
      pointer.ty = 0
      pointer.inside = false
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerleave', onLeave)
    return () => {
      listeners -= 1
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerleave', onLeave)
    }
  }, [])
}

let listeners = 0

/** Critically damped-ish smoothing, frame-rate independent. */
export function ease(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}
