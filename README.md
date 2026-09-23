# LUCIDE

Site vitrine du studio créatif **LUCIDE** — reconstruction de la référence
`alche.studio` : hero WebGL temps réel (grille en perspective, cristal
réfractif, triangles flottants, scanlines CRT), wordmark géant, HUD mono,
barre de consentement sonore et parcours éditorial complet (actualités,
projets, à propos, studio, contact, footer).

## Démarrer

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + build de production (dist/)
npm run preview    # sert le build sur http://localhost:4173
```

## Architecture

```
src/
  three/        scène WebGL : Canvas, grille, cristal, triangles, effets
  components/   chrome DOM : header, menu latéral, barre son, curseur, loader, HUD 3D
  sections/     contenu : hero, actualités, projets, à propos, studio, contact, footer
  lib/          smooth scroll (Lenis + ScrollTrigger), helpers d'animation, moteur audio
  store/        état global zustand (son, menu, curseur, coordonnées 3D, loader)
  content/      tout le contenu éditorial FR, typé
  styles/       tokens de design + base globale
```

Le canvas WebGL est `position: fixed` derrière le DOM pour **tout** le
document. Le monde ne s'arrête pas au hero : la caméra continue de descendre
dans un couloir infini (sol, plafond, parois quadrillés, ancrés dans l'espace
3D) et l'environnement se fond d'un monde à l'autre au fil du scroll — espace
violet profond → halle électrique → **feuille « blueprint » claire** →
grille technique noire → outro. Les sections posent un voile translucide
(`.band`) sur cette scène au lieu d'un fond opaque, donc le décor reste
visible et continue de changer derrière le contenu.
`CONTRACT.md` documente le découpage, les API publiques et la spécification
visuelle de référence.

## Hero : typographie et chorégraphie

- **Wordmark** : Inter Variable en graisse **700** (`--font-wordmark`,
  `--fs-wordmark`). Le réglage est mesuré sur le mockup de référence, pas
  choisi à l'œil : hauteur de capitale ≈ 25,8 % de la hauteur de vue, largeur
  totale ≈ 69 % de la largeur, capitale centrée à 48 % de la hauteur
  (`width/cap = 4,73` pour les deux). Pas d'étirement vertical, pas de glow :
  le mot est blanc et net, seul le cristal le traverse.
- **Pin du hero** : `.hero` fait 200 vh et `.hero__stage` est `sticky`. La
  progression du pin est publiée en continu par `App.tsx` sur `:root` via la
  variable CSS `--hero-p` (0 → 1 pour le pin, jusqu'à 1,3 pour la sortie) :
  le wordmark grossit et se dissout, le HUD s'efface, le cristal tourne et
  grossit (`src/three/Crystal.tsx`), la caméra de la grille avance
  (`src/three/Backdrop.tsx`). Aucun re-render React sur le scroll.
- Le cristal est un prisme de verre (transmission + dispersion) : il réfracte
  le fantôme WebGL du wordmark (`src/three/WordmarkGhost.tsx`), avec arêtes
  néon (fresnel additif) et fractures procédurales (voronoï) pour l'éclat
  intérieur.

## Scroll : la plongée continue

- `App.tsx` mesure chaque `[data-section]`, en fait une échelle de mondes
  (`WORLD_BY_SECTION`) et publie à chaque frame
  `env = { from, to, mix, travel, center }` dans le store (`setEnv`), en même
  temps que `--hero-p`.
- `src/three/palette.ts` contient les palettes des mondes (`PALETTES`) et
  `blendPalette()` : couleur de base, lignes de grille, halo, cellule, brouillard
  et « feuille claire » sont interpolés entre les deux mondes encadrants.
- `src/three/Backdrop.tsx` raymarche un couloir infini (sol, plafond, parois,
  plus le mur quadrillé face caméra du mock) et fait avancer la caméra
  d'environ 30 unités sur la hauteur du document : la structure défile, la
  brume avale le fond, la profondeur se creuse.
- `src/three/Corridor.tsx` fait défiler des cadres techniques suspendus dans
  l'espace (parallaxe), recyclés devant la caméra pour ne jamais s'épuiser.
- Le chapitre manifeste bascule la page en mode clair : `App.tsx` écrit
  `data-world` sur `<html>` et les jetons d'encre/surface s'inversent
  (`src/styles/global.css`), comme la feuille blanche du site de référence.

## Projets : un index, pas une scène

Le chapitre projets est une liste éditoriale : une ligne par projet (numéro,
date, nom, client, résumé, tags), séparée par des filets, révélée au scroll.
Les écrans 3D qui tournaient dans la scène WebGL ont été supprimés — la
carrière de cartes ne tenait pas sans les visuels du site de référence, et
tout le chapitre pinnait sept écrans de scroll pour rien. La page est passée
de ~14 700 px à ~10 200 px.

## Stack

React 19 · TypeScript strict · Vite · three.js · @react-three/fiber ·
@react-three/drei · @react-three/postprocessing · GSAP (ScrollTrigger) ·
Lenis · Motion · zustand · SplitType · Web Audio / Howler ·
react-hook-form + zod · Archivo / Inter / JetBrains Mono (self-hosted).

## QA visuelle

`scripts/shot.mjs` pilote le Chrome du système via `playwright-core`
(aucun navigateur à télécharger) pour capturer des écrans et remonter les
erreurs console :

```bash
npm run dev
node scripts/shot.mjs --url http://localhost:5173 --out .shots --tag hero \
  --shots top,#projets,#a-propos,bottom
node scripts/shot.mjs --mobile --tag mobile --shots top,#projets
```
