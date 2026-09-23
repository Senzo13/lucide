import { useEffect, useRef, useState } from 'react'
import { useAppStore, type CursorVariant } from '../store/useAppStore'
import './Cursor.css'

const INTERACTIVE = 'a, button, [role="button"], input, textarea, select, label, [data-cursor]'

export default function Cursor() {
  const variant = useAppStore((s) => s.cursorVariant)
  const label = useAppStore((s) => s.cursorLabel)
  const setCursor = useAppStore((s) => s.setCursor)
  const [fine, setFine] = useState(false)
  const dot = useRef<HTMLSpanElement>(null)
  const ring = useRef<HTMLSpanElement>(null)
  const pos = useRef({ x: -120, y: -120, rx: -120, ry: -120 })

  useEffect(() => {
    const query = window.matchMedia('(hover: hover) and (pointer: fine)')
    const apply = () => {
      setFine(query.matches)
      document.body.dataset.cursor = query.matches ? 'custom' : ''
    }
    apply()
    query.addEventListener('change', apply)
    return () => {
      query.removeEventListener('change', apply)
      document.body.dataset.cursor = ''
    }
  }, [])

  useEffect(() => {
    if (!fine) return

    const onMove = (event: PointerEvent) => {
      pos.current.x = event.clientX
      pos.current.y = event.clientY
    }
    window.addEventListener('pointermove', onMove, { passive: true })

    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const p = pos.current
      p.rx += (p.x - p.rx) * 0.18
      p.ry += (p.y - p.ry) * 0.18
      if (dot.current) dot.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`
      if (ring.current) ring.current.style.transform = `translate3d(${p.rx}px, ${p.ry}px, 0)`
    }
    raf = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [fine])

  useEffect(() => {
    if (!fine) return

    const onOver = (event: PointerEvent) => {
      const element = (event.target as Element | null)?.closest?.(INTERACTIVE) as HTMLElement | null
      if (!element) {
        setCursor('default')
        return
      }
      const explicit = element.dataset.cursor as CursorVariant | undefined
      const next: CursorVariant =
        explicit ?? (element.matches('input, textarea, select') ? 'text' : 'hover')
      if (next === 'view' && useAppStore.getState().cursorVariant === 'drag') return
      setCursor(next, element.dataset.cursorLabel ?? '')
    }

    const onOut = (event: PointerEvent) => {
      const next = (event.relatedTarget as Element | null)?.closest?.(INTERACTIVE)
      if (!next) setCursor('default')
    }

    document.addEventListener('pointerover', onOver, { passive: true })
    document.addEventListener('pointerout', onOut, { passive: true })
    return () => {
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
    }
  }, [fine, setCursor])

  if (!fine) return null

  return (
    <div className="cursor" data-variant={variant} aria-hidden="true">
      <span ref={ring} className="cursor__ring">
        <span className="cursor__label">{label}</span>
      </span>
      <span ref={dot} className="cursor__dot" />
    </div>
  )
}
