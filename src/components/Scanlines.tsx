import './Scanlines.css'

/**
 * Global CRT overlay: the fine scanlines and a light grain — the texture of
 * the glass the whole page is seen through.
 *
 * There used to be a slow coloured band travelling down the frame every
 * fourteen seconds. It is gone: a sweep that moves on its own reads as a
 * glitch of the *page*, not as a property of the screen, and it kept pulling
 * the eye away from whatever the wall was doing.
 */
export default function Scanlines() {
  return (
    <div className="scanlines" aria-hidden="true">
      <div className="scanlines__lines" />
      <div className="scanlines__grain" />
    </div>
  )
}
