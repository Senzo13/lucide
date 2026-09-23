import { useEffect, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { site } from '../content/site'
import { revealOnView } from '../lib/animate'
import { scrollToSection } from '../lib/scroll'
import './Footer.css'

export default function Footer() {
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    const node = root.current
    if (!node) return
    return revealOnView(node)
  }, [])

  const go = (href: string) => (event: ReactMouseEvent) => {
    if (!href.startsWith('#')) return
    event.preventDefault()
    scrollToSection(href)
  }

  return (
    <footer id="footer" className="section footer" ref={root} data-section>
      <div className="footer__inner">
        <div className="footer__top">
          <div className="footer__brand" data-reveal>
            <span className="u-mono u-faint">STUDIO CRÉATIF TEMPS RÉEL</span>
            <p className="footer__brand-text">{site.description}</p>
          </div>

          <nav className="footer__columns" aria-label="Liens de pied de page">
            {site.footer.columns.map((column, index) => (
              <div
                key={column.title}
                className="footer__column"
                data-reveal
                style={{ '--d': index } as CSSProperties}
              >
                <span className="u-mono u-faint">{column.title}</span>
                <ul>
                  {column.links.map((link) => (
                    <li key={`${column.title}-${link.label}`}>
                      <a
                        className="footer__link"
                        href={link.href}
                        onClick={go(link.href)}
                        {...(link.href.startsWith('#') ? {} : { target: '_blank', rel: 'noreferrer' })}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="footer__wordmark" aria-hidden="true">
          {site.name}
        </div>

        <div className="footer__bottom">
          <span className="u-mono u-faint">{site.footer.copyright}</span>
          <ul className="footer__legal">
            {site.footer.legal.map((item) => (
              <li key={item.label}>
                <a className="u-mono footer__link" href={item.href} onClick={go(item.href)}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <span className="u-mono u-faint">{site.poweredBy}</span>
        </div>
      </div>
    </footer>
  )
}
