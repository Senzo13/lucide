import { useEffect, useRef, useState } from 'react'
import { site } from '../content/site'
import { stopScroll } from '../lib/scroll'
import { useAppStore } from '../store/useAppStore'
import './Loader.css'

const HARD_STOP = 3000

export default function Loader() {
  const sceneReady = useAppStore((s) => s.sceneReady)
  const frontReady = useAppStore((s) => s.frontReady)
  const setLoaded = useAppStore((s) => s.setLoaded)
  const setProgress = useAppStore((s) => s.setProgress)
  const [pct, setPct] = useState(0)
  const [leaving, setLeaving] = useState(false)
  const [gone, setGone] = useState(false)
  const finished = useRef(false)
  const valueRef = useRef(0)

  useEffect(() => {
    document.body.dataset.locked = 'true'
    stopScroll(true)
    return () => {
      document.body.dataset.locked = ''
      stopScroll(false)
    }
  }, [])

  useEffect(() => {
    let raf = 0
    const clock = { t: performance.now() }

    const finish = () => {
      if (finished.current) return
      finished.current = true
      setPct(100)
      setProgress(1)
      window.setTimeout(() => setLeaving(true), 200)
      window.setTimeout(() => {
        setGone(true)
        setLoaded(true)
        document.body.dataset.locked = ''
        stopScroll(false)
      }, 900)
    }

    const hardStop = window.setTimeout(finish, HARD_STOP)

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - clock.t) / 1000)
      clock.t = now
      const elapsed = now / 1000
      /* The curtain only lifts once the *foreground* canvas has painted too:
         the gem and its texture are the first thing the visitor looks at, and
         revealing the page without them is what made them arrive late. */
      const { sceneReady: back, frontReady: fore } = useAppStore.getState()
      const target = back && fore ? 100 : Math.min(94, 94 * (1 - Math.exp(-elapsed / 1.35)))
      valueRef.current += (target - valueRef.current) * (1 - Math.exp(-dt * 6.2))
      if (valueRef.current > 99.4 && target === 100) {
        finish()
        return
      }
      setPct(valueRef.current)
      setProgress(Math.min(0.95, valueRef.current / 100))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(hardStop)
    }
  }, [setLoaded, setProgress, sceneReady, frontReady])

  if (gone) return null

  return (
    <div
      className="loader"
      data-leaving={leaving}
      role="status"
      aria-live="polite"
      aria-label={`Chargement du site ${Math.round(pct)}%`}
    >
      <div className="loader__inner">
        <span className="loader__brand u-display">{site.name}</span>
        <span className="u-mono loader__label">CHARGEMENT DU MONDE</span>
      </div>
      <span className="u-mono loader__counter">{String(Math.round(pct)).padStart(3, '0')}%</span>
      <span className="loader__bar" aria-hidden="true">
        <span className="loader__bar-fill" style={{ transform: `scaleX(${pct / 100})` }} />
      </span>
    </div>
  )
}
