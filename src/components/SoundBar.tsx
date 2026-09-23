import { useEffect, useRef } from 'react'
import { audio, blip } from '../lib/audio'
import { site } from '../content/site'
import { useAppStore } from '../store/useAppStore'
import './SoundBar.css'

const EQ_BARS = 5

export default function SoundBar() {
  const root = useRef<HTMLDivElement>(null)
  const decision = useAppStore((s) => s.audioDecision)
  const audioEnabled = useAppStore((s) => s.audioEnabled)
  const levels = useAppStore((s) => s.audioLevels)
  const loaded = useAppStore((s) => s.loaded)
  const decideAudio = useAppStore((s) => s.decideAudio)

  useEffect(() => {
    root.current?.setAttribute('data-loaded', String(loaded))
  }, [loaded])

  const activate = async () => {
    blip(true)
    await audio.enable()
    decideAudio('on')
  }

  const skip = () => {
    audio.disable()
    decideAudio('off')
  }

  const state = decision === 'pending' ? 'ask' : audioEnabled ? 'on' : 'off'

  return (
    <div ref={root} className="sound-bar" data-state={state} data-loaded="false" aria-live="polite">
      <div className="sound-bar__group">
        <span className="sound-bar__eq" aria-hidden="true">
          {Array.from({ length: EQ_BARS }).map((_, index) => (
            <span
              key={index}
              className="sound-bar__eq-bar"
              style={{ transform: `scaleY(${(levels[index % levels.length] ?? 0.2) * 1.5 + 0.22})` }}
            />
          ))}
        </span>
        <span className="u-mono sound-bar__label">{site.sound.label}</span>
      </div>

      <span className="sound-bar__divider" aria-hidden="true" />

      <p className="sound-bar__question">{site.sound.question}</p>

      <div className="sound-bar__actions">
        {state === 'ask' ? (
          <>
            <button type="button" className="u-pill sound-bar__on" onClick={activate}>
              <span className="u-pill__inner">
                <span>{site.sound.on}</span>
                <span className="u-pill__hover" aria-hidden="true">
                  {site.sound.on}
                </span>
              </span>
            </button>
            <button type="button" className="u-underline sound-bar__off" onClick={skip}>
              {site.sound.off}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="u-underline sound-bar__off"
            onClick={() => {
              blip(false)
              audio.disable()
              decideAudio('off')
            }}
          >
            COUPER LE SON
          </button>
        )}
      </div>

      <span className="sound-bar__divider" aria-hidden="true" />

      <span className="u-mono sound-bar__powered">{site.poweredBy}</span>
    </div>
  )
}
