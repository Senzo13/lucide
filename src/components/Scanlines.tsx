import './Scanlines.css'

/** Global CRT overlay: fine scanlines, a slow sweep band and a light grain. */
export default function Scanlines() {
  return (
    <div className="scanlines" aria-hidden="true">
      <div className="scanlines__lines" />
      <div className="scanlines__sweep" />
      <div className="scanlines__grain" />
    </div>
  )
}
