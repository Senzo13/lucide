import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react'
import clsx from 'clsx'
import { site } from '../content/site'
import { audio, blip } from '../lib/audio'
import { scrollToSection } from '../lib/scroll'
import { useAppStore } from '../store/useAppStore'
import WaveText from './WaveText'
import './Header.css'

export default function Header() {
  const root = useRef<HTMLElement>(null)
  const audioEnabled = useAppStore((s) => s.audioEnabled)
  const levels = useAppStore((s) => s.audioLevels)
  const menuOpen = useAppStore((s) => s.menuOpen)
  const setMenuOpen = useAppStore((s) => s.setMenuOpen)
  const decideAudio = useAppStore((s) => s.decideAudio)

  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const scrolled = window.scrollY > 24
        root.current?.setAttribute('data-scrolled', String(scrolled))
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  const handleSound = async () => {
    const next = !audioEnabled
    blip(next)
    if (next) {
      await audio.enable()
      decideAudio('on')
    } else {
      audio.disable()
      decideAudio('off')
    }
  }

  const go = (href: string) => (event: ReactMouseEvent) => {
    event.preventDefault()
    scrollToSection(href)
  }

  return (
    <header ref={root} className="header" data-scrolled="false">
      <a className="header__logo" href="#top" onClick={go('#top')} aria-label="LUCIDE — retour en haut">
        {site.name}
      </a>

      <nav className="header__nav" aria-label="Navigation principale">
        {site.nav.map((item) => (
          <a key={item.href} className="header__nav-item" href={item.href} onClick={go(item.href)}>
            <span className="header__nav-inner">
              <span>
                <WaveText text={item.label} />
              </span>
              <span className="header__nav-ghost" aria-hidden="true">
                <WaveText text={item.label} />
              </span>
            </span>
          </a>
        ))}
      </nav>

      <div className="header__right">
        <a className="u-pill header__cta" href={site.cta.href} onClick={go(site.cta.href)}>
          <span className="u-pill__inner">
            <span>
              <WaveText text={site.cta.label} />
            </span>
            <span className="u-pill__hover" aria-hidden="true">
              {site.cta.label}
            </span>
          </span>
        </a>

        <button
          type="button"
          className={clsx('header__sound', audioEnabled && 'is-on')}
          aria-pressed={audioEnabled}
          aria-label={audioEnabled ? 'Couper le son' : 'Activer le son'}
          onClick={handleSound}
        >
          {[0, 1, 2].map((bar) => (
            <span
              key={bar}
              className="header__sound-bar"
              style={{ transform: `scaleY(${(levels[bar % levels.length] ?? 0.2) * 1.35 + 0.25})` }}
            />
          ))}
        </button>

        <button
          type="button"
          className="header__burger"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span />
          <span />
        </button>
      </div>
    </header>
  )
}
