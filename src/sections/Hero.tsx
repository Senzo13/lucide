import { useEffect, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import HeroType from '../components/HeroType'
import { site } from '../content/site'
import { channelCut } from '../lib/channel'
import { useAppStore } from '../store/useAppStore'
import './Hero.css'

export default function Hero() {
  const root = useRef<HTMLElement>(null)
  const loaded = useAppStore((s) => s.loaded)

  useEffect(() => {
    root.current?.setAttribute('data-loaded', String(loaded))
  }, [loaded])

  const goNews = (event: ReactMouseEvent) => {
    event.preventDefault()
    channelCut('#actualites')
  }

  return (
    <section id="top" data-section ref={root} className="hero" data-loaded="false">
      <div className="hero__stage">
        <div className="hero__type">
          <HeroType />
        </div>

        <div className="hero__chrome">
          <div className="hero__rail hero__rail--brief hero__reveal" style={{ '--d': 1 } as CSSProperties}>
            <p className="hero__rail-lines">
              {site.baseline.map((line) => (
                <span key={line} className="u-mono">
                  {line}
                </span>
              ))}
            </p>
            <span className="u-rule" />
          </div>

          <div className="hero__rail hero__rail--craft hero__reveal" style={{ '--d': 3 } as CSSProperties}>
            <p className="hero__rail-lines">
              {site.disciplinesShortline.map((line) => (
                <span key={line} className="u-mono">
                  {line}
                </span>
              ))}
            </p>
            <span className="u-rule" />
          </div>

          <div className="hero__version hero__reveal" style={{ '--d': 4 } as CSSProperties}>
            <span className="u-mono">{site.version}</span>
            <span className="hero__version-rule" aria-hidden="true" />
          </div>

          <div className="hero__news hero__reveal" style={{ '--d': 2 } as CSSProperties}>
            <div className="hero__news-head">
              <span className="u-mono">{site.hero.eyebrow}</span>
              <span className="hero__news-rule" aria-hidden="true" />
            </div>
            <ul className="hero__news-list">
              {site.news.map((item) => (
                <li key={item.id} className="hero__news-item">
                  <a
                    className="hero__news-link"
                    href={item.href}
                    onClick={goNews}
                    data-cursor="hover"
                    aria-label={`${item.date} — ${item.title}`}
                  >
                    <span className="u-mono hero__news-date">{item.date}</span>
                    <span className="hero__news-title">{item.title}</span>
                    <span className="hero__news-arrow" aria-hidden="true">
                      →
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
