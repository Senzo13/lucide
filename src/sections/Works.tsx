import { useEffect, useRef } from 'react'
import { site } from '../content/site'
import { revealOnView } from '../lib/animate'
import { carouselIndex } from '../lib/chapters'
import { useAppStore } from '../store/useAppStore'
import './Works.css'

const COUNT = site.projects.length
/** one viewport of scroll per project, plus the run-in and the run-out */
const RUN_IN = 0.5

/**
 * The projects chapter is a *place*, not a list: the camera stands in the dark
 * hall while the banners of the carousel (drawn by the WebGL layer) slide past,
 * and this sticky stage only carries the caption — date, title, client, tags —
 * exactly like the reference. Scrolling turns the carousel; the caption follows
 * whichever banner is in front.
 */
export default function Works() {
  const root = useRef<HTMLElement>(null)
  const index = useAppStore((s) => {
    const p = s.chapters.projets
    if (p === undefined) return 0
    return carouselIndex(p, COUNT)
  })

  useEffect(() => {
    const node = root.current
    if (!node) return
    return revealOnView(node, { selector: '[data-reveal]' })
  }, [])

  const active = site.projects[Math.min(COUNT - 1, Math.max(0, index))]

  return (
    <section
      id="projets"
      data-section
      ref={root}
      className="section band works"
      style={{ height: `${(COUNT + RUN_IN * 2) * 100}vh` }}
    >
      <div className="works__stage">
        <header className="works__head" data-reveal>
          <h2 className="u-mono works__kicker">PROJETS</h2>
          <span className="s-head__rule" aria-hidden="true" />
          <span className="u-mono u-faint">
            {String(index + 1).padStart(2, '0')} / {String(COUNT).padStart(2, '0')}
          </span>
        </header>

        <div className="works__caption" key={active.id}>
          <span className="u-mono works__date">{active.date}</span>
          <h3 className="works__title">{active.title}</h3>
          <span className="u-mono works__client">{active.client}</span>
          <p className="works__summary">{active.summary}</p>
          <ul className="works__tags">
            {active.tags.map((tag) => (
              <li key={tag} className="u-mono works__tag">
                {tag}
              </li>
            ))}
          </ul>
        </div>

        <span className="u-mono works__more" aria-hidden="true">
          MORE WORKS ↗
        </span>

        <ol className="works__index" aria-label="Projets">
          {site.projects.map((project, i) => (
            <li key={project.id} className="u-mono works__index-item" data-active={i === index}>
              {project.index}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
