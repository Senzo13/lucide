import { createRoot } from 'react-dom/client'
import ScreenWall from './ScreenWall'
import './demo.css'

/**
 * Proof that the wall is a module and not a page.
 *
 * This is a *host*: it knows nothing about the wall's internals — it drops
 * `<ScreenWall />` into a footer, sets a height, and puts its own content over
 * the top. Exactly the three lines another project would write.
 */
function Demo() {
  return (
    <div className="demo">
      <header className="demo__top">
        <span className="demo__mark">NEVOLABS</span>
        <span className="demo__tag">SCREENWALL · DÉMO D&apos;EXPORT</span>
      </header>

      <main className="demo__body">
        <h1 className="demo__title">LE MUR D&apos;ÉCRANS, EN FOND DE FOOTER</h1>
        <p className="demo__lead">
          Un mur de cases qui écrit <em>APPS</em>, <em>WEBSITE</em>, <em>LOGO</em> une lettre à la
          fois, joue une mer, une page, un petit coureur poursuivi — et s&apos;éteint case par case.
          Devant lui, le <strong>N</strong> en verre liquide : il tourne quand la souris passe,
          et la lumière du mur le traverse.
        </p>
        <p className="demo__lead demo__lead--dim">
          Ce fichier ne fait que ce qu&apos;un autre projet ferait : importer le composant, fixer une
          hauteur, laisser le fondu faire la jointure.
        </p>
      </main>

      <footer className="demo__footer">
        {/* the wall: no tabs, no chrome — a background, a fade, an emblem */}
        <ScreenWall
          words={['APPS', 'WEBSITE', 'LOGO']}
          emblem="monogram"
          fade={34}
          /* six rangées de seize écrans : la bande remplit la boîte, et chaque
             figure se dessine à la résolution de l'écran (voir `README.md`) */
          screenRows={6}
          cell={1.29}
        />
        <div className="demo__footer-inner">
          <span className="demo__wordmark">NEVOLABS</span>
          <nav className="demo__links">
            <a href="#apps">APPS</a>
            <a href="#websites">WEBSITES</a>
            <a href="#logos">LOGOS</a>
            <a href="#contact">CONTACT</a>
          </nav>
          <span className="demo__legal">© NEVOLABS — SCREENWALL v1.0</span>
        </div>
      </footer>
    </div>
  )
}

const host = document.getElementById('root')
if (host) createRoot(host).render(<Demo />)
