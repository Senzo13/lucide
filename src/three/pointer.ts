import { useEffect } from 'react'

/**
 * Shared normalised pointer (-1 → 1) used by every 3D layer for parallax.
 * Kept outside of React state on purpose: it is read inside rAF loops only.
 */
export const pointer = { x: 0, y: 0, tx: 0, ty: 0 }

export function useGlobalPointer() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const onMove = (event: PointerEvent) => {
      pointer.tx = (event.clientX / window.innerWidth) * 2 - 1
      pointer.ty = -((event.clientY / window.innerHeight) * 2 - 1)
    }
    const onLeave = () => {
      pointer.tx = 0
      pointer.ty = 0
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerleave', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerleave', onLeave)
    }
  }, [])
}

/** Critically damped-ish smoothing, frame-rate independent. */
export function ease(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}
