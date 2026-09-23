import { useEffect, useRef, type CSSProperties } from 'react'
import { site } from '../content/site'
import { revealOnView, scramble } from '../lib/animate'
import './About.css'

export default function About() {
  const root = useRef<HTMLElement>(null)
  const kicker = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const node = root.current
    if (!node) return
    const cleanup = revealOnView(node)

    const target = kicker.current
    const timer = window.setTimeout(() => {
      if (target) scramble(target, site.manifesto.kicker, 0.9)
    }, 220)

    return () => {
      cleanup()
      window.clearTimeout(timer)
    }
  }, [])

  return (
    <section id="a-propos" data-section className="section band about section--hold" ref={root}>
      <div className="section__inner">
        <header className="s-head" data-reveal>
          <h2 className="u-mono about__kicker">
            <span ref={kicker}>{site.manifesto.kicker}</span>
          </h2>
          <span className="s-head__rule" aria-hidden="true" />
          <span className="u-mono u-faint">POURQUOI NOUS FAISONS ÇA</span>
        </header>

        <div className="about__manifesto">
          {site.manifesto.lines.map((line, index) => (
            <span
              key={line}
              className="about__line"
              data-reveal
              style={{ '--d': index } as CSSProperties}
            >
              {line}
            </span>
          ))}
        </div>

        <p className="about__lead" data-reveal>
          {site.manifesto.lead}
        </p>

        <div className="about__columns">
          {site.manifesto.paragraphs.map((paragraph, index) => (
            <p key={paragraph} className="about__paragraph" data-reveal style={{ '--d': index } as CSSProperties}>
              {paragraph}
            </p>
          ))}
        </div>

        <ul className="about__stats">
          {site.manifesto.stats.map((stat, index) => (
            <li key={stat.label} className="about__stat" data-reveal style={{ '--d': index } as CSSProperties}>
              <span className="about__stat-value">{stat.value}</span>
              <span className="u-mono about__stat-label">{stat.label}</span>
            </li>
          ))}
        </ul>

        <ul className="about__values">
          {site.manifesto.values.map((value, index) => (
            <li key={value.title} className="about__value" data-reveal style={{ '--d': index } as CSSProperties}>
              <span className="u-mono about__value-title">{value.title}</span>
              <p className="about__value-body">{value.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
