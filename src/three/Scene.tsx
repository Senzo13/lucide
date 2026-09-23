import {
  Component,
  Suspense,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { Canvas } from '@react-three/fiber'
import Backdrop from './Backdrop'
import Crystal from './Crystal'
import WordLayer from './WordLayer'
import Effects from './Effects'
import { useAppStore, DEFAULT_ROTATION } from '../store/useAppStore'
import { useGlobalPointer } from './pointer'
import './Scene.css'

/**
 * The WebGL layer builds its textures, geometry and materials once per mount
 * and drives them from frame loops, so a hot update can only ever half-apply:
 * React swaps the component while the canvas keeps drawing the *previous*
 * meshes. In the browser that is indistinguishable from "the change was never
 * made". Anything touched under `src/three/` therefore reloads the page.
 */
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', (payload) => {
    const touched = payload.updates.some((update) =>
      update.acceptedPath.replace(/\\/g, '/').includes('/three/'),
    )
    if (touched) window.location.reload()
  })
}

/** WebGL must never take the page down: fall back to the CSS gradient. */
class GLCatch extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

export default function Scene() {
  const activeSection = useAppStore((s) => s.activeSection)
  const frontReady = useAppStore((s) => s.frontReady)
  const setSceneReady = useAppStore((s) => s.setSceneReady)
  const setViewRotation = useAppStore((s) => s.setViewRotation)
  const readyRef = useRef(false)
  const dragRef = useRef({
    active: false,
    x: 0,
    y: 0,
    raf: false,
    pending: null as null | [number, number],
  })
  const dragSurface = useRef<HTMLDivElement>(null)

  useGlobalPointer()

  useEffect(() => {
    const id = window.setTimeout(() => setSceneReady(true), 3000)
    return () => window.clearTimeout(id)
  }, [setSceneReady])

  const markReady = () => {
    if (readyRef.current) return
    readyRef.current = true
    setSceneReady(true)
  }

  const flush = () => {
    const store = useAppStore.getState()
    const pending = dragRef.current.pending
    dragRef.current.pending = null
    if (!pending) return
    store.setViewRotation([pending[0], pending[1], DEFAULT_ROTATION[2]])
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current.active = true
    dragRef.current.x = event.clientX
    dragRef.current.y = event.clientY
    dragSurface.current?.setAttribute('data-dragging', 'true')
    event.currentTarget.setPointerCapture(event.pointerId)
    useAppStore.getState().setCursor('drag', 'ORBITE')
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return
    const dx = event.clientX - dragRef.current.x
    const dy = event.clientY - dragRef.current.y
    dragRef.current.x = event.clientX
    dragRef.current.y = event.clientY

    const [rx, ry] = useAppStore.getState().viewRotation
    const next: [number, number] = [rx + dy * 0.006, ry + dx * 0.008]
    dragRef.current.pending = next
    // throttled publish: at most one store write per animation frame
    if (!dragRef.current.raf) {
      dragRef.current.raf = true
      requestAnimationFrame(() => {
        dragRef.current.raf = false
        flush()
      })
    }
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    dragSurface.current?.setAttribute('data-dragging', 'false')
    flush()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    useAppStore.getState().setCursor('view')
  }

  return (
    <GLCatch>
      <div className="scene-layer scene-layer--back" aria-hidden="true">
        <Canvas
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
          camera={{ position: [0, 0.55, 6], fov: 54, near: 0.1, far: 90 }}
          onCreated={markReady}
          style={{ pointerEvents: 'none' }}
        >
          <Suspense fallback={null}>
            <Backdrop />
            <WordLayer />
          </Suspense>
        </Canvas>
      </div>

      {/* The gem's own canvas. It sits *above* the DOM, which is the whole
          point of the key visual: the stone has to cut into the wordmark, not
          hang behind it. */}
      <div className="scene-layer scene-layer--front" data-ready={frontReady}>
        <Canvas
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
          camera={{ position: [0, 0, 5.4], fov: 42, near: 0.1, far: 60 }}
          style={{ pointerEvents: 'none' }}
        >
          <Suspense fallback={null}>
            <ambientLight intensity={0.6} />
            <Crystal />
            <Effects />
          </Suspense>
        </Canvas>
        <div
          ref={dragSurface}
          className="scene-drag"
          data-live={activeSection === 'top'}
          data-dragging="false"
          data-cursor="view"
          data-cursor-label="GLISSER POUR ORBITER"
          role="presentation"
          aria-hidden="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        />
      </div>
    </GLCatch>
  )
}
