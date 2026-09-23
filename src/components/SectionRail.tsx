import { useEffect, useState } from 'react'
import { channelCut } from '../lib/channel'
import { useAppStore } from '../store/useAppStore'
import './SectionRail.css'

/** the journey, in scroll order — the rail is that ladder made visible */
const STOPS = [
  { id: 'top', label: 'TOP' },
  { id: 'actualites', label: 'ACTUS' },
  { id: 'projets', label: 'PROJETS' },
  { id: 'a-propos', label: 'À PROPOS' },
  { id: 'studio', label: 'STUDIO' },
  { id: 'contact', label: 'CONTACT' },
  { id: 'footer', label: 'FIN' },
]

/**
 * The vertical section rail of the reference: a hairline down the left of the
 * frame with one tick per chapter. It is part of the permanent chrome — it
 * never scrolls away and it is what gives the page its "technical instrument"
 * read while the world keeps moving behind it.
 */
export default function SectionRail() {
  const activeSection = useAppStore((s) => s.activeSection)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      setProgress((prev) => {
        const next = Math.min(1, Math.max(0, window.scrollY / max))
        return Math.abs(next - prev) > 0.002 ? next : prev
      })
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const index = Math.max(
    0,
    STOPS.findIndex((stop) => stop.id === activeSection),
  )

  return (
    <nav className="rail" aria-label="Sections du site">
      <span className="rail__line" aria-hidden="true" />
      <span className="rail__cursor" style={{ top: `${progress * 100}%` }} aria-hidden="true" />
      <ul className="rail__list">
        {STOPS.map((stop, i) => (
          <li key={stop.id} className="rail__item" data-active={i === index}>
            <button
              type="button"
              className="rail__tick"
              data-cursor="hover"
              aria-current={i === index ? 'true' : undefined}
              onClick={() => channelCut(`#${stop.id}`)}
            >
              <span className="rail__dash" aria-hidden="true" />
              <span className="u-mono rail__label">{stop.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
