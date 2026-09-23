import { useEffect, useRef, type CSSProperties } from 'react'
import { site } from '../content/site'
import { revealOnView } from '../lib/animate'
import './Studio.css'

export default function Studio() {
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    const node = root.current
    if (!node) return
    return revealOnView(node)
  }, [])

  return (
    <section id="studio" data-section className="section band studio section--hold" ref={root}>
      <div className="section__inner">
        <header className="s-head" data-reveal>
          <h2 className="u-mono studio__kicker">{site.studio.kicker}</h2>
          <span className="s-head__rule" aria-hidden="true" />
          <span className="u-mono u-faint">PARIS · MARSEILLE</span>
        </header>

        <h3 className="studio__title" data-reveal>
          {site.studio.title}
        </h3>

        <p className="studio__lead" data-reveal>
          {site.studio.lead}
        </p>

        <ul className="studio__offices">
          {site.studio.offices.map((office, index) => (
            <li key={office.city} className="studio__office" data-reveal style={{ '--d': index } as CSSProperties}>
              <div className="studio__office-head">
                <span className="studio__city">{office.city}</span>
                <span className="u-mono studio__office-label">{office.label}</span>
              </div>
              <span className="u-mono studio__address">{office.address}</span>
              <span className="u-mono studio__coords">{office.coords}</span>
            </li>
          ))}
        </ul>

        <div className="studio__split">
          <div className="studio__team">
            <h4 className="u-mono studio__sub">ÉQUIPE</h4>
            <ul className="studio__team-list">
              {site.studio.team.map((member, index) => (
                <li
                  key={member.name}
                  className="studio__member"
                  data-reveal
                  style={{ '--d': index } as CSSProperties}
                >
                  <span className="studio__member-name">{member.name}</span>
                  <span className="u-mono studio__member-role">{member.role}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="studio__process">
            <h4 className="u-mono studio__sub">MÉTHODE</h4>
            <ol className="studio__steps">
              {site.studio.process.map((step, index) => (
                <li key={step.step} className="studio__step" data-reveal style={{ '--d': index } as CSSProperties}>
                  <span className="u-mono studio__step-index">{step.step}</span>
                  <div className="studio__step-body">
                    <span className="u-mono studio__step-title">{step.title}</span>
                    <p className="studio__step-text">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}
