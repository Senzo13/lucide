import type { CSSProperties } from 'react'
import './Marks.css'

/**
 * The little "+" registration marks the reference scatters across the whole
 * viewport — tracking crosses of a camera view, not decoration on a section.
 * They belong to the permanent chrome and never move with the scroll.
 */
const MARKS = [
  { x: 12.5, y: 12, s: 1, o: 0.5 },
  { x: 33.5, y: 6.5, s: 0.8, o: 0.34 },
  { x: 62, y: 10.5, s: 1.1, o: 0.4 },
  { x: 88.5, y: 21, s: 0.9, o: 0.44 },
  { x: 6.5, y: 47.5, s: 0.9, o: 0.36 },
  { x: 45.5, y: 39, s: 0.75, o: 0.28 },
  { x: 74.5, y: 52.5, s: 1, o: 0.32 },
  { x: 22, y: 72, s: 0.85, o: 0.3 },
  { x: 55, y: 83.5, s: 1, o: 0.26 },
  { x: 91, y: 68.5, s: 0.8, o: 0.3 },
]

export default function Marks() {
  return (
    <div className="marks" aria-hidden="true">
      {MARKS.map((mark, index) => (
        <span
          key={`${mark.x}-${mark.y}`}
          className="marks__cross"
          style={{
            left: `${mark.x}%`,
            top: `${mark.y}%`,
            opacity: mark.o,
            '--s': mark.s,
            '--i': index,
          } as CSSProperties}
        />
      ))}
    </div>
  )
}
