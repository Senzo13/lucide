import { useEffect, type MouseEvent as ReactMouseEvent } from 'react'
import { site } from '../content/site'
import { stopScroll, scrollToSection } from '../lib/scroll'
import { useAppStore } from '../store/useAppStore'
import './SideMenu.css'

const ENTRIES = [...site.nav, site.cta]

export default function SideMenu() {
  const menuOpen = useAppStore((s) => s.menuOpen)
  const setMenuOpen = useAppStore((s) => s.setMenuOpen)
  const audioEnabled = useAppStore((s) => s.audioEnabled)

  useEffect(() => {
    stopScroll(menuOpen)
    document.body.dataset.menu = menuOpen ? 'open' : ''
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen, setMenuOpen])

  const go = (href: string) => (event: ReactMouseEvent) => {
    event.preventDefault()
    setMenuOpen(false)
    window.setTimeout(() => scrollToSection(href), 260)
  }

  return (
    <div className="side-menu" data-open={menuOpen} role="dialog" aria-modal="true" aria-label="Menu">
      <div className="side-menu__panel">
        <div className="side-menu__head">
          <span className="u-mono u-dim">INDEX</span>
          <button type="button" className="u-mono side-menu__close" onClick={() => setMenuOpen(false)}>
            FERMER
          </button>
        </div>

        <nav className="side-menu__nav" aria-label="Menu principal">
          {ENTRIES.map((entry, index) => (
            <a
              key={entry.href}
              className="side-menu__item"
              href={entry.href}
              onClick={go(entry.href)}
              tabIndex={menuOpen ? 0 : -1}
            >
              <span className="u-mono side-menu__index">{String(index + 1).padStart(2, '0')}</span>
              <span className="u-display side-menu__label">{entry.label}</span>
              <span className="side-menu__arrow" aria-hidden="true">
                →
              </span>
            </a>
          ))}
        </nav>

        <div className="side-menu__foot">
          <div className="side-menu__col">
            <span className="u-mono u-faint">ÉCRIRE</span>
            <a className="side-menu__link" href={`mailto:${site.contact.email}`}>
              {site.contact.email}
            </a>
            <a className="side-menu__link" href={`mailto:${site.contact.recruit}`}>
              {site.contact.recruit}
            </a>
          </div>
          <div className="side-menu__col">
            <span className="u-mono u-faint">SUIVRE</span>
            {site.contact.socials.map((social) => (
              <a
                key={social.label}
                className="side-menu__link"
                href={social.href}
                target="_blank"
                rel="noreferrer"
              >
                {social.label}
              </a>
            ))}
          </div>
          <div className="side-menu__col">
            <span className="u-mono u-faint">ÉTAT</span>
            <span className="side-menu__link">SON {audioEnabled ? 'ACTIF' : 'COUPÉ'}</span>
            <span className="side-menu__link">{site.version}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
