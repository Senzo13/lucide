import { useEffect, useRef } from 'react'
import Scene from './three/Scene'
import Header from './components/Header'
import SideMenu from './components/SideMenu'
import SoundBar from './components/SoundBar'
import Cursor from './components/Cursor'
import Loader from './components/Loader'
import Scanlines from './components/Scanlines'
import SectionRail from './components/SectionRail'
import Hud from './components/Hud'
import Marks from './components/Marks'
import Hero from './sections/Hero'
import News from './sections/News'
import Works from './sections/Works'
import About from './sections/About'
import Studio from './sections/Studio'
import Contact from './sections/Contact'
import Footer from './sections/Footer'
import { initSmoothScroll, destroySmoothScroll, ScrollTrigger } from './lib/scroll'
import { stopScroll } from './lib/scroll'
import { useAppStore, WORLD_BY_SECTION, type WorldMode } from './store/useAppStore'
import { WORLD_TINT } from './store/useAppStore'
import './App.css'

/** one measured section of the journey ladder (DOM order = scroll order) */
type LadderStep = { id: string; center: number; top: number; height: number; mode: WorldMode }

function smoothstep(t: number) {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

export default function App() {
  const mainRef = useRef<HTMLElement>(null)
  const setActiveSection = useAppStore((s) => s.setActiveSection)
  const setWorldMode = useAppStore((s) => s.setWorldMode)
  const setProgress = useAppStore((s) => s.setProgress)
  const loaded = useAppStore((s) => s.loaded)

  useEffect(() => {
    initSmoothScroll()
    const id = window.setTimeout(() => ScrollTrigger.refresh(), 400)
    return () => {
      window.clearTimeout(id)
      destroySmoothScroll()
    }
  }, [])

  /* Preload progress: ramps to 82% on its own, snaps to 100% once the WebGL
     scene has painted its first frame. Feeds the intro overlay. */
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const { sceneReady, progress } = useAppStore.getState()
      const cap = sceneReady ? 1 : 0.82
      const next = Math.min(cap, progress + dt * 0.6)
      if (next > progress) setProgress(next)
      if (next < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    fonts?.ready?.then(() => setProgress(Math.max(useAppStore.getState().progress, 0.45)))
    return () => cancelAnimationFrame(raf)
  }, [setProgress])

  /* Freeze the page while the intro overlay is up. */
  useEffect(() => {
    document.body.dataset.locked = loaded ? 'false' : 'true'
    stopScroll(!loaded)
    if (loaded) window.setTimeout(() => ScrollTrigger.refresh(), 600)
  }, [loaded])

  /* Publish scroll metrics for the WebGL choreography (cheap: only writes when
     the values actually move, and no component re-renders on scroll). The pin
     progress is also mirrored as a CSS variable so the hero wordmark, the HUD
     and the WebGL layers can all react without a single React render. */
  useEffect(() => {
    let raf = 0
    let lastEmit = 0
    let lastVar = -1
    let lastTint = ''
    let lastTick = performance.now()
    /* how much an editorial chapter — rather than the key visual — owns the
       viewport; eased in the loop so it never snaps at a section boundary */
    let content = 0
    let ladder: LadderStep[] = []

    /* Measure the journey ladder: every section becomes a world the camera
       travels through. Recomputed on resize and after the intro unlock. */
    const measure = () => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-section]'))
      ladder = nodes
        .map((node) => {
          const rect = node.getBoundingClientRect()
          const top = rect.top + window.scrollY
          const id = node.id || 'baseline'
          return {
            id,
            top,
            height: rect.height,
            center: top + rect.height / 2,
            mode: WORLD_BY_SECTION[id] ?? 'space',
          }
        })
        .sort((a, b) => a.center - b.center)
    }
    measure()
    window.addEventListener('resize', measure)
    const remeasure = window.setTimeout(measure, 1200)

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const y = window.scrollY
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      const viewport = Math.max(1, window.innerHeight)
      const heroProgress = Math.min(1, Math.max(0, y / viewport))
      /* the CSS variable is allowed to run past 1 so the exit tail (the one
         viewport where the hero scrolls away) can still be animated */
      const heroPin = Math.min(1.3, Math.max(0, y / viewport))
      if (Math.abs(heroPin - lastVar) > 0.0005) {
        lastVar = heroPin
        document.documentElement.style.setProperty('--hero-p', heroPin.toFixed(4))
      }
      if (now - lastEmit < 33) return
      lastEmit = now
      const progress = Math.min(1, Math.max(0, y / max))
      useAppStore.getState().setScroll({
        y,
        progress,
        heroProgress,
      })

      /* Blend the environment between the two sections the viewport centre is
         sitting between — the WebGL world therefore never hard-cuts while the
         camera keeps sinking. */
      const center = y + viewport * 0.5
      let from: WorldMode = ladder[0]?.mode ?? 'space'
      let to: WorldMode = ladder[ladder.length - 1]?.mode ?? from
      let mix = 1
      if (ladder.length > 1) {
        if (center <= ladder[0].center) {
          to = from
          mix = 0
        } else if (center >= ladder[ladder.length - 1].center) {
          from = to
          mix = 0
        } else {
          for (let i = 0; i < ladder.length - 1; i += 1) {
            const a = ladder[i]
            const b = ladder[i + 1]
            if (center >= a.center && center <= b.center) {
              from = a.mode
              to = b.mode
              mix = smoothstep((center - a.center) / Math.max(1, b.center - a.center))
              break
            }
          }
        }
      }
      useAppStore.getState().setEnv({ from, to, mix, travel: progress, center })

      /* The DOM gets the same colour journey as the room: the two worlds the
         viewport sits between are blended into one tint, published as RGB so
         every scrim, rule and selection on the page drifts with the camera. */
      const tintA = WORLD_TINT[from] ?? WORLD_TINT.space
      const tintB = WORLD_TINT[to] ?? tintA
      const tint = [
        Math.round(tintA[0] + (tintB[0] - tintA[0]) * mix),
        Math.round(tintA[1] + (tintB[1] - tintA[1]) * mix),
        Math.round(tintA[2] + (tintB[2] - tintA[2]) * mix),
      ] as const
      const tintKey = tint.join(' ')
      if (tintKey !== lastTint) {
        lastTint = tintKey
        const rootStyle = document.documentElement.style
        rootStyle.setProperty('--tint-r', String(tint[0]))
        rootStyle.setProperty('--tint-g', String(tint[1]))
        rootStyle.setProperty('--tint-b', String(tint[2]))
      }

      /* The room is the subject of the key visual and the background of
         everything else. This is the value that tells the two apart: it ramps
         up as a content chapter centres, and the page answers with a content
         wash (see `.app-wash`) so the grid stops crossing the copy. */
      let nearestStep = ladder[0]
      for (const step of ladder) {
        if (Math.abs(step.center - center) < Math.abs(nearestStep.center - center)) nearestStep = step
      }
      const focus =
        !nearestStep || nearestStep.mode === 'space' ? 0 : nearestStep.mode === 'outro' ? 0.6 : 1
      const dt = Math.min(0.25, (now - lastTick) / 1000)
      lastTick = now
      content += (focus - content) * Math.min(1, dt * 4)
      document.documentElement.style.setProperty('--content-p', content.toFixed(4))

      const nearest = mix < 0.5 ? from : to
      const root = document.documentElement
      if (root.dataset.world !== nearest) root.dataset.world = nearest
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
      window.clearTimeout(remeasure)
    }
  }, [])

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-section]'))
    if (!sections.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id || 'baseline'
            setActiveSection(id)
            const mode = WORLD_BY_SECTION[id]
            if (mode) setWorldMode(mode, `section:${id}`)
          }
        })
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    )
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [setActiveSection, setWorldMode])

  return (
    <div className="app">
      <Scene />
      <div className="app-shade" aria-hidden="true" />
      <div className="app-wash" aria-hidden="true" />
      <Scanlines />
      <Header />
      <SideMenu />
      <SectionRail />
      <Marks />
      <Hud />
      <main className="app-main" ref={mainRef}>
        <Hero />
        <News />
        <Works />
        <About />
        <Studio />
        <Contact />
        <Footer />
      </main>
      <SoundBar />
      <Cursor />
      <Loader />
    </div>
  )
}
