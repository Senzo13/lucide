/**
 * When the wall speaks.
 *
 * A moment is one broadcast: a word, a seed (which take it plays) and how long
 * it lasts. The envelope turns that into two numbers the renderer needs — how
 * loud the wall is (`cut`, 0 → 1) and where in the take we are (`phase`,
 * 0 → 1) — and it is deliberately *clock-agnostic*: you hand it a time in
 * seconds from whatever clock you already have, so the room, the emblem and
 * the DOM can all read the same moment without sharing a timer.
 *
 * `createEnvelope` is the standalone version: it decides *when* to speak
 * (`tick`, on the clock you render with), and the caller decides nothing else.
 * A host that already has an event to hang the wall on (a scroll, a click, an
 * API) can use `envelopeCut` alone and publish its own moments.
 */

export type Moment = {
  /** increments on every moment — watch this, never the object */
  nonce: number
  /** what the wall says, uppercase */
  word: string
  /** 0 → 1: which take this moment plays */
  seed: number
  /** how long the moment lasts, in seconds */
  duration: number
  /** when it started, on the caller's clock */
  startedAt: number
}

export type EnvelopeOptions = {
  /** the idents, in order */
  words?: string[]
  /** seconds between two moments (randomised between the two) */
  every?: [number, number]
  /** how long one moment lasts */
  duration?: number
  /** seconds before the first moment */
  delay?: number
}

export type Envelope = {
  /** how loudly the wall is speaking right now, 0 → 1 */
  cut: (at: number) => number
  /** where in the take we are, 0 → 1 (1 when nothing is playing) */
  phase: (at: number) => number
  /** the moment being played, or null */
  moment: () => Moment | null
  /**
   * Advance the schedule *on the caller's clock* — call it once a frame, with
   * the same clock you hand to `cut` and `phase`.
   *
   * This is the whole reason the envelope has no timer of its own: a moment
   * dated by `performance.now()` and rendered against a canvas clock that
   * started when the canvas mounted are two different times, and the wall ends
   * up speaking into the past — a broadcast that never lands. One clock, and
   * the wall keeps talking.
   */
  tick: (at: number) => void
  /** start one now — a chapter change, a click, a qa hook */
  speak: (word?: string, duration?: number, at?: number) => void
  /** arm the schedule (`at` = the caller's clock if it is already running) */
  start: (at?: number) => void
  /**
   * Change les mots et le tempo *sans toucher au moment en cours* : c'est ce
   * qu'un composant doit appeler quand ses props changent, plutôt que de
   * refabriquer une enveloppe — une enveloppe neuve repart de zéro, et la
   * phrase qu'elle préparait n'arrive jamais.
   */
  configure: (options: EnvelopeOptions) => void
  /** stop scheduling (a pause, a hidden tab) */
  stop: () => void
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * How loud the wall is, given where the take is: a short fade in, a long hold,
 * then out before the next moment takes over. This is the one piece of timing
 * both the site and the standalone wall must agree on, so it is a plain
 * function of the phase.
 */
export const envelopeCut = (phase: number) => {
  if (phase <= 0 || phase >= 1) return 0
  return Math.min(1, phase / 0.09) * (1 - smoothstep(0.74, 1, phase))
}

export function createEnvelope(options: EnvelopeOptions = {}): Envelope {
  let words = options.words?.length ? options.words : ['LUCIDE', 'TEMPS RÉEL', 'SIGNAL']
  let [min, max] = options.every ?? [10, 17]
  let duration = options.duration ?? 7.2
  const delay = options.delay ?? 2.6

  let current: Moment | null = null
  let next = 0
  let step = 0
  let running = false
  let armed = false

  /* les options vivent ici, pas dans le React qui appelle : le mur peut être
     rendu cent fois sans que son tempo reparte de zéro */
  const configure = (options: EnvelopeOptions) => {
    if (options.words?.length) words = options.words
    if (options.every) [min, max] = options.every
    if (typeof options.duration === 'number') duration = options.duration
  }

  const schedule = (at: number) => {
    next = at + min + Math.random() * Math.max(0, max - min)
  }

  const speak = (word?: string, length?: number, at = 0) => {
    const text = word ?? words[step % words.length]
    step += 1
    current = {
      nonce: (current?.nonce ?? 0) + 1,
      word: text.toUpperCase(),
      seed: Math.random(),
      duration: length ?? duration,
      /* daté sur l'horloge de l'appelant : celle qui rendra la phrase */
      startedAt: at,
    }
    schedule(at)
  }

  const phaseAt = (at: number) => {
    if (!current) return 1
    return (at - current.startedAt) / Math.max(0.2, current.duration)
  }

  return {
    cut: (at) => envelopeCut(phaseAt(at)),
    phase: phaseAt,
    moment: () => current,
    tick: (at) => {
      if (!running) return
      if (!armed) {
        armed = true
        schedule(at + delay)
        return
      }
      if (at < next) return
      speak(undefined, undefined, at)
    },
    speak,
    configure,
    start: (at) => {
      running = true
      if (typeof at === 'number') {
        armed = true
        schedule(at + delay)
      }
    },
    stop: () => {
      running = false
    },
  }
}
