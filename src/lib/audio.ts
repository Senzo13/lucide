import { useAppStore } from '../store/useAppStore'

export type AudioEngine = {
  init(): Promise<void>
  enable(): Promise<void>
  disable(): void
  toggle(): Promise<void>
  setVolume(v: number): void
  readonly enabled: boolean
}

const BANDS = 5
const MAX_LEVEL = 0.62
const LEVEL_FPS = 18

let context: AudioContext | null = null
let master: GainNode | null = null
let analyser: AnalyserNode | null = null
let droneGains: GainNode[] = []
let sources: AudioScheduledSourceNode[] = []
let running = false
let volume = MAX_LEVEL
let levelRaf = 0
let lastLevelTime = 0
const subscribers = new Set<(levels: number[]) => void>()

const supportsWebAudio = () => typeof window !== 'undefined' && 'AudioContext' in window

/** Pink-ish noise buffer — the "air" of the room. */
function noiseBuffer(ctx: AudioContext, seconds = 4) {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1
    last = (last + 0.018 * white) / 1.018
    data[i] = Math.max(-1, Math.min(1, last * 3.2))
  }
  return buffer
}

/** Exponentially decaying noise → convolution reverb, generated on the fly. */
function reverbImpulse(ctx: AudioContext, seconds = 3.2, decay = 2.6) {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
    }
  }
  return buffer
}

function buildGraph() {
  if (context) return context
  context = new AudioContext()
  const ctx = context

  master = ctx.createGain()
  master.gain.value = 0
  analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  analyser.smoothingTimeConstant = 0.82

  const bus = ctx.createGain()
  bus.gain.value = 0.9

  const convolver = ctx.createConvolver()
  convolver.buffer = reverbImpulse(ctx)
  const wet = ctx.createGain()
  wet.gain.value = 0.42

  bus.connect(master)
  bus.connect(convolver)
  convolver.connect(wet)
  wet.connect(master)
  master.connect(analyser)
  analyser.connect(ctx.destination)

  // --- drone: three detuned voices through a slowly breathing lowpass -----
  const droneFilter = ctx.createBiquadFilter()
  droneFilter.type = 'lowpass'
  droneFilter.frequency.value = 620
  droneFilter.Q.value = 0.9
  droneFilter.connect(bus)

  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.045
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = 280
  lfo.connect(lfoGain)
  lfoGain.connect(droneFilter.frequency)
  lfo.start()
  sources.push(lfo)

  const voices: Array<[OscillatorType, number, number]> = [
    ['sine', 55, 0.5],
    ['triangle', 82.41, 0.26],
    ['sine', 110.5, 0.2],
    ['triangle', 164.81, 0.1],
  ]

  voices.forEach(([type, frequency, level], index) => {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.value = frequency
    osc.detune.value = (index % 2 === 0 ? 1 : -1) * (4 + index * 2)

    const gain = ctx.createGain()
    gain.gain.value = level * 0.5
    osc.connect(gain)
    gain.connect(droneFilter)

    // very slow amplitude drift so the bed never feels static
    const drift = ctx.createOscillator()
    drift.frequency.value = 0.03 + index * 0.017
    const driftGain = ctx.createGain()
    driftGain.gain.value = level * 0.22
    drift.connect(driftGain)
    driftGain.connect(gain.gain)
    drift.start()

    osc.start()
    sources.push(osc, drift)
    droneGains.push(gain)
  })

  // --- filtered noise bed -------------------------------------------------
  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer(ctx)
  noise.loop = true
  const noiseFilter = ctx.createBiquadFilter()
  noiseFilter.type = 'bandpass'
  noiseFilter.frequency.value = 620
  noiseFilter.Q.value = 0.7
  const noiseGain = ctx.createGain()
  noiseGain.gain.value = 0.055
  noise.connect(noiseFilter)
  noiseFilter.connect(noiseGain)
  noiseGain.connect(bus)
  noise.start()
  sources.push(noise)

  const noiseLfo = ctx.createOscillator()
  noiseLfo.frequency.value = 0.07
  const noiseLfoGain = ctx.createGain()
  noiseLfoGain.gain.value = 0.03
  noiseLfo.connect(noiseLfoGain)
  noiseLfoGain.connect(noiseGain.gain)
  noiseLfo.start()
  sources.push(noiseLfo)

  return ctx
}

function measure() {
  if (!analyser) return new Array(BANDS).fill(0)
  const data = new Uint8Array(analyser.frequencyBinCount)
  analyser.getByteFrequencyData(data)
  const levels: number[] = []
  const step = Math.floor(data.length / BANDS)
  for (let band = 0; band < BANDS; band += 1) {
    let sum = 0
    for (let i = band * step; i < (band + 1) * step; i += 1) sum += data[i]
    const average = sum / Math.max(1, step) / 255
    levels.push(Math.min(1, Math.max(0.06, average * 2.6)))
  }
  return levels
}

function startLevelLoop() {
  if (levelRaf) return
  const tick = (time: number) => {
    if (!running && !subscribers.size) {
      levelRaf = 0
      return
    }
    levelRaf = requestAnimationFrame(tick)
    if (time - lastLevelTime < 1000 / LEVEL_FPS) return
    lastLevelTime = time
    const levels = running ? measure() : new Array(BANDS).fill(0.05)
    subscribers.forEach((cb) => cb(levels))
    useAppStore.getState().setAudioLevels(levels)
  }
  levelRaf = requestAnimationFrame(tick)
}

function fade(to: number, seconds: number) {
  if (!context || !master) return
  const now = context.currentTime
  master.gain.cancelScheduledValues(now)
  master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now)
  master.gain.linearRampToValueAtTime(Math.max(0.0001, to), now + seconds)
}

class WebAudioEngine implements AudioEngine {
  get enabled() {
    return running
  }

  async init() {
    if (!supportsWebAudio()) return
    buildGraph()
    startLevelLoop()
  }

  async enable() {
    if (!supportsWebAudio()) return
    const ctx = buildGraph()
    if (ctx.state === 'suspended') await ctx.resume()
    running = true
    fade(volume, 1.6)
    startLevelLoop()
  }

  disable() {
    if (!context) {
      running = false
      return
    }
    running = false
    fade(0, 0.7)
  }

  async toggle() {
    if (running) this.disable()
    else await this.enable()
  }

  setVolume(v: number) {
    volume = Math.max(0, Math.min(1, v)) * MAX_LEVEL
    if (running) fade(volume, 0.4)
  }
}

export const audio: AudioEngine = new WebAudioEngine()

export function subscribeLevels(cb: (levels: number[]) => void): () => void {
  subscribers.add(cb)
  startLevelLoop()
  return () => {
    subscribers.delete(cb)
    // the loop stops itself once nothing is listening and audio is off
  }
}

/** Tiny UI confirmation blip (used when the visitor allows / mutes sound). */
export function blip(up = true) {
  if (!supportsWebAudio()) return
  const ctx = buildGraph()
  if (ctx.state === 'suspended') void ctx.resume()

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(up ? 660 : 320, now)
  osc.frequency.exponentialRampToValueAtTime(up ? 1320 : 180, now + 0.14)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.36)
}
