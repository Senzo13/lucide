import { useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { site } from '../content/site'
import { useAppStore } from '../store/useAppStore'
import './ViewGizmo.css'

const RADIUS = 46

const format = (value: number) => {
  const fixed = Math.abs(value) < 0.05 ? '0.0' : value.toFixed(1)
  if (fixed === '0.0') return '0.0'
  return value > 0 ? `+${fixed}` : fixed
}

export default function ViewGizmo() {
  const coords = useAppStore((s) => s.coords)
  const rotation = useAppStore((s) => s.viewRotation)
  const setViewRotation = useAppStore((s) => s.setViewRotation)
  const resetView = useAppStore((s) => s.resetView)
  const setCursor = useAppStore((s) => s.setCursor)
  const dial = useRef<HTMLDivElement>(null)
  const drag = useRef({ active: false, x: 0, y: 0 })

  const [rx, ry] = rotation
  const ballX = 50 + Math.sin(ry) * 32
  const ballY = 50 - Math.sin(rx) * 32

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { active: true, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
    setCursor('drag', 'VUE 3D')
  }

  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return
    const dx = event.clientX - drag.current.x
    const dy = event.clientY - drag.current.y
    drag.current.x = event.clientX
    drag.current.y = event.clientY
    const next: [number, number, number] = [
      Math.max(-1.2, Math.min(1.2, rx + dy * 0.01)),
      ry + dx * 0.012,
      rotation[2],
    ]
    setViewRotation(next)
  }

  const onUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current.active) return
    drag.current.active = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setCursor('view')
  }

  return (
    <section className="gizmo" aria-label={site.view.title}>
      <p className="u-mono gizmo__title">{site.view.title}</p>

      <ul className="gizmo__coords">
        <li className="gizmo__coord">
          <span className="gizmo__dot gizmo__dot--x" aria-hidden="true" />
          <span className="u-mono">{format(coords.x)}</span>
        </li>
        <li className="gizmo__coord">
          <span className="gizmo__dot" aria-hidden="true" />
          <span className="u-mono">{format(coords.y)}</span>
        </li>
        <li className="gizmo__coord">
          <span className="gizmo__dot" aria-hidden="true" />
          <span className="u-mono">{format(coords.z)}</span>
        </li>
        <li className="gizmo__coord">
          <span className="gizmo__dot gizmo__dot--w" aria-hidden="true" />
          <span className="u-mono">{coords.w.toFixed(1)}</span>
        </li>
      </ul>

      <div
        ref={dial}
        className="gizmo__dial"
        role="slider"
        tabIndex={0}
        aria-label="Orienter la vue 3D"
        aria-valuemin={-180}
        aria-valuemax={180}
        aria-valuenow={Math.round((ry * 180) / Math.PI)}
        data-cursor="view"
        data-cursor-label="ORBITE"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') setViewRotation([rx, ry - 0.12, rotation[2]])
          if (event.key === 'ArrowRight') setViewRotation([rx, ry + 0.12, rotation[2]])
          if (event.key === 'ArrowUp') setViewRotation([Math.max(-1.2, rx - 0.1), ry, rotation[2]])
          if (event.key === 'ArrowDown') setViewRotation([Math.min(1.2, rx + 0.1), ry, rotation[2]])
        }}
      >
        <svg className="gizmo__svg" viewBox="0 0 120 120" aria-hidden="true">
          <circle className="gizmo__ring" cx="60" cy="60" r={RADIUS} />
          <circle className="gizmo__ring gizmo__ring--inner" cx="60" cy="60" r={RADIUS * 0.62} />
          <line className="gizmo__axis gizmo__axis--y" x1="60" y1={60 - RADIUS - 6} x2="60" y2={60 + RADIUS + 6} />
          <line className="gizmo__axis gizmo__axis--x" x1={60 - RADIUS - 6} y1="60" x2={60 + RADIUS + 6} y2="60" />
          <circle className="gizmo__node gizmo__node--up" cx="60" cy={60 - RADIUS} r="4" />
          <circle className="gizmo__node gizmo__node--right" cx={60 + RADIUS} cy="60" r="4" />
          <circle className="gizmo__node gizmo__node--core" cx="60" cy="60" r="5" />
        </svg>
        <span
          className="gizmo__ball"
          style={{ left: `${ballX}%`, top: `${ballY}%` }}
          aria-hidden="true"
        />
      </div>

      <button type="button" className="u-mono gizmo__reset" onClick={resetView} data-cursor="hover">
        {site.view.reset}
      </button>
    </section>
  )
}
