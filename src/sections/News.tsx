import { useEffect, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { site } from '../content/site'
import { revealOnView } from '../lib/animate'
import { scrollToSection } from '../lib/scroll'
import './News.css'

export default function News() {
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    const node = root.current
    if (!node) return
    return revealOnView(node)
  }, [])

  return (
    <section id="actualites" data-section className="section band news section--hold" ref={root}>
      <div className="section__inner">
        <header className="s-head" data-reveal>
          <h2 className="u-mono news__kicker">ACTUALITÉS</h2>
          <span className="s-head__rule" aria-hidden="true" />
          <span className="u-mono u-faint">{String(site.news.length).padStart(2, '0')} ENTRÉES</span>
        </header>

        <ul className="news__list">
          {site.news.map((item, index) => (
            <li key={item.id} className="news__item" data-reveal style={{ '--d': index } as CSSProperties}>
              <a
                className="news__link"
                href={item.href}
                data-cursor="hover"
                onClick={(event: ReactMouseEvent) => {
                  event.preventDefault()
                  scrollToSection('#actualites')
                }}
              >
                <span className="u-mono news__index">{String(index + 1).padStart(2, '0')}</span>
                <span className="u-mono news__date">{item.date}</span>
                <h3 className="news__title">{item.title}</h3>
                <span className="news__arrow" aria-hidden="true">
                  →
                </span>
                <p className="news__excerpt">{item.excerpt}</p>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
