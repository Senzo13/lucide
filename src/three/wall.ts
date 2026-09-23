import { useAppStore } from '../store/useAppStore'
import { envelopeCut } from '../wall/envelope'

/**
 * The wall's broadcast moment, sampled by clock.
 *
 * The room has two canvases — the backdrop and the gem — and both have to agree
 * on *when* the wall is speaking, or the light on the stone will not match the
 * light in the room. So the envelope lives here, in one place, and each frame
 * loop asks for it. `performance.now()` is the shared clock: it is the only one
 * the two render loops read identically.
 */
let nonce = 0
let startedAt = -1
let duration = 1

const now = () => performance.now() / 1000

/** pick up a moment the DOM has just published; returns its 0 → 1 phase */
function phase(at: number) {
  const moment = useAppStore.getState().wallMoment
  if (moment && moment.nonce !== nonce) {
    nonce = moment.nonce
    startedAt = at
    duration = Math.max(0.8, moment.duration)
  }
  if (startedAt < 0) return 1
  return (at - startedAt) / duration
}

/** how loudly the wall is currently speaking, 0 → 1 */
export function wallCut(at = now()) {
  const t = phase(at)
  return envelopeCut(t)
}

/** where in the moment we are, 0 → 1 (1 when nothing is playing) */
export function wallPhase(at = now()) {
  return phase(at)
}

/** which redraw of the pattern is on screen (the picture re-locking) */
export function wallStep(at = now()) {
  const t = phase(at)
  return Math.floor(Math.max(0, Math.min(1, t)) * 12)
}
