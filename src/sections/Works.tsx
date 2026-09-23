import { useEffect, useRef, type CSSProperties } from 'react'
import { site } from '../content/site'
import { revealOnView } from '../lib/animate'
import WaveText from '../components/WaveText'
import './Works.css'

/**
 * The projects chapter.
 *
 * It is a plain editorial index: one row per project, in reverse
 * chronological order, with the name, the client, the one-line summary and the
 * tags. Everything lives in the document — no pinned stage, no carousel, no
 * screens floating in the scene. The projects are read, not performed.
 */
export default function Works() {
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    const node = root.current
    if (!node) return
    return revealOnView(node)
  }, [])

  return (
    <section id="projets" data-section ref={root} className="section band works">
      <div className="section__inner">
        <header className="s-head" data-reveal>
          <h2 className="u-mono works__kicker">PROJETS</h2>
          <span className="s-head__rule" aria-hidden="true" />
          <span className="u-mono u-faint">
            {String(site.projects.length).padStart(2, '0')} PROJETS
          </span>
        </header>

        <ol className="works__list">
          {site.projects.map((project, index) => (
            <li
              key={project.id}
              className="works__item wave-hover"
              data-reveal
              style={{ '--d': index, '--accent': project.accent } as CSSProperties}
            >
              <span className="u-mono works__index">{project.index}</span>
              <span className="u-mono works__date">{project.date}</span>

              <div className="works__body">
                <h3 className="works__title">
                  <WaveText text={project.title} />
                </h3>
                <span className="u-mono works__client">{project.client}</span>
                <p className="works__summary">{project.summary}</p>
                <ul className="works__tags">
                  {project.tags.map((tag) => (
                    <li key={tag} className="u-mono works__tag">
                      {tag}
                    </li>
                  ))}
                </ul>
              </div>

              <span className="works__mark" aria-hidden="true" />
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
