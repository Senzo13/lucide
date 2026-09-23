import { useEffect, useRef, type CSSProperties } from 'react'
import { site } from '../content/site'
import { useAppStore } from '../store/useAppStore'
import './HeroType.css'

type Props = {
  text?: string
  className?: string
}

/**
 * The giant centred wordmark. Renders as plain transparent type so the WebGL
 * crystal layer can composite over it, and reveals letter by letter on load.
 */
export default function HeroType({ text = site.name, className }: Props) {
  const root = useRef<HTMLSpanElement>(null)
  const loaded = useAppStore((s) => s.loaded)

  useEffect(() => {
    const node = root.current
    if (!node) return
    node.dataset.state = loaded ? 'in' : 'out'
  }, [loaded])

  return (
    <span
      ref={root}
      className={className ? `hero-type ${className}` : 'hero-type'}
      data-state="out"
      role="heading"
      aria-level={1}
    >
      <span className="sr-only">{text}</span>
      <span className="hero-type__word" aria-hidden="true">
        {text.split('').map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            className="hero-type__letter"
            style={{ '--i': index } as CSSProperties}
          >
            {letter}
          </span>
        ))}
      </span>
    </span>
  )
}
