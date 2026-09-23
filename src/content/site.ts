/* ==========================================================================
   LUCIDE — editorial content (FR)
   Every string rendered by the site lives here.
   ========================================================================== */

export type NewsItem = {
  id: string
  date: string
  title: string
  excerpt: string
  href: string
}

export type Project = {
  id: string
  index: string
  date: string
  title: string
  client: string
  summary: string
  tags: string[]
  accent: string
  href: string
}

export type Discipline = {
  id: string
  index: string
  title: string
  body: string
  items: string[]
}

/**
 * One entry per chapter of the journey: what the channel cut paints on the
 * mosaic while the page swaps, and the ident it prints in the corner.
 * `label` is what the cells spell out letter by letter, `tag` is the HUD
 * read-out above them.
 */
export type ChannelIdent = {
  label: string
  tag: string
}

export const site = {
  name: 'LUCIDE',
  version: 'LUCIDE v1.0',
  baseline: ['CRÉER', 'DES MONDES', 'PLUS CLAIRS'],
  disciplinesShortline: ['ART', 'TECHNOLOGIE', 'EXPÉRIENCES'],
  poweredBy: 'POWERED BY NEVOLABS',
  locale: 'FR',
  description:
    "Studio créatif temps réel. Nous concevons des mondes, des images et des expériences qui rendent le numérique tangible.",
  nav: [
    { label: 'Actualités', href: '#actualites' },
    { label: 'Projets', href: '#projets' },
    { label: 'À propos', href: '#a-propos' },
    { label: 'Studio', href: '#studio' },
  ],
  cta: { label: 'Contact / Recrutement', href: '#contact' },
  sound: {
    label: 'SON',
    question: "Ce site contient du son. Voulez-vous l'activer ?",
    on: 'Activer le son',
    off: 'Continuer sans son',
  },
  view: {
    title: 'VUE 3D TEMPS RÉEL',
    reset: 'RÉINITIALISER LA VUE',
    drag: 'GLISSER POUR ORBITER',
  },
  /* the broadcast identity of every chapter — the channel cut between two
     sections spells `label` out across its mosaic and prints `tag` in the
     corner (see `src/components/ChannelWipe.tsx`) */
  channels: {
    top: { label: 'ACCUEIL', tag: 'CANAL 01 · OUVERTURE' },
    actualites: { label: 'ACTUALITÉS', tag: 'CANAL 02 · JOURNAL' },
    projets: { label: 'PROJETS', tag: 'CANAL 03 · PRODUCTIONS' },
    'a-propos': { label: 'MANIFESTE', tag: 'CANAL 04 · À PROPOS' },
    studio: { label: 'STUDIO', tag: 'CANAL 05 · PLATEAU' },
    contact: { label: 'CONTACT', tag: 'CANAL 06 · LIAISON' },
    footer: { label: 'GÉNÉRIQUE', tag: 'CANAL 07 · FIN DE BANDES' },
  } satisfies Record<string, ChannelIdent>,
  hero: {
    eyebrow: 'ACTUALITÉS',
    scroll: 'DÉFILER POUR EXPLORER',
  },
  news: [
    {
      id: 'n1',
      date: '2025.06.24',
      title: 'LUCIDE AU FESTIVAL NUITS NUMÉRIQUES 2025',
      excerpt:
        'Trois nuits, une installation temps réel de 14 mètres et un public invité à déplacer la lumière à la main.',
      href: '#actualites',
    },
    {
      id: 'n2',
      date: '2025.05.14',
      title: 'NOUVEAU PROJET : ORA, UNE EXPÉRIENCE IMMERSIVE',
      excerpt:
        'ORA explore la mémoire d’un lieu à travers un dôme de 360° piloté par le souffle des visiteurs.',
      href: '#actualites',
    },
    {
      id: 'n3',
      date: '2025.04.03',
      title: "LUCIDE REJOINT LE COLLECTIF DES CRÉATIFS D'AUJOURD'HUI",
      excerpt:
        'Un collectif européen de studios indépendants qui partagent outils, recherche et terrains d’expérimentation.',
      href: '#actualites',
    },
  ] as NewsItem[],
  projects: [
    {
      id: 'p1',
      index: '01',
      date: '2026.01.17',
      title: 'PRISME',
      client: 'Fondation Lumen',
      summary:
        'Un monolithe de verre piloté en temps réel : la foule modifie la réfraction, la réfraction modifie le son.',
      tags: ['Installation', 'Temps réel', 'WebGL'],
      accent: '#8b5cf6',
      href: '#projets',
    },
    {
      id: 'p2',
      index: '02',
      date: '2025.11.02',
      title: 'ORA',
      client: 'Biennale de Marseille',
      summary: 'Dôme immersif de 360°, 12 projecteurs, un moteur de particules qui apprend le souffle des visiteurs.',
      tags: ['Immersif', 'Spatial audio', 'Captation'],
      accent: '#d946ef',
      href: '#projets',
    },
    {
      id: 'p3',
      index: '03',
      date: '2025.09.21',
      title: 'SILENCE RADIO',
      client: 'Maison de la Radio',
      summary: 'Architecture sonore générative : dix ans d’archives radiophoniques recomposées en direct.',
      tags: ['Audio', 'Génératif', 'Archive'],
      accent: '#3a49c9',
      href: '#projets',
    },
    {
      id: 'p4',
      index: '04',
      date: '2025.07.08',
      title: 'NUIT BLANCHE',
      client: 'Ville de Paris',
      summary: 'Mapping volumétrique sur la façade nord : 4 millions de points calculés sur GPU.',
      tags: ['Mapping', 'GPU', 'Événement'],
      accent: '#ff6a1a',
      href: '#projets',
    },
    {
      id: 'p5',
      index: '05',
      date: '2025.03.30',
      title: 'MINERAL',
      client: 'Studio Nevolabs',
      summary: 'Bibliothèque de matières procédurales pour la prévisualisation temps réel de projets d’architecture.',
      tags: ['R&D', 'Shaders', 'Outils'],
      accent: '#67e8f9',
      href: '#projets',
    },
    {
      id: 'p6',
      index: '06',
      date: '2024.12.12',
      title: 'ÉCHO',
      client: 'Festival Nuits Numériques',
      summary: 'Chœur d’avatars synchronisés sur une partition générée à partir des pas du public.',
      tags: ['Temps réel', 'Multijoueur', 'Scène'],
      accent: '#f0abfc',
      href: '#projets',
    },
  ] as Project[],
  manifesto: {
    kicker: 'À PROPOS',
    lines: ['CRÉER', 'DES MONDES', 'PLUS CLAIRS'],
    lead:
      'LUCIDE est un studio de création numérique. Nous fabriquons des images, des sons et des espaces qui rendent visible ce qui ne l’est pas encore.',
    paragraphs: [
      'Nous réunissons artistes, développeurs temps réel et techniciens lumière autour d’une même table, dès la première esquisse.',
      'Notre pratique tient dans un mot : la clarté. Rendre lisible un système complexe, sans jamais retirer la part de mystère qui fait qu’une image reste en mémoire.',
      'Nos outils sont des moteurs de jeu, des shaders, du son spatialisé — et parfois simplement un projecteur, une feuille de papier calque et beaucoup de patience.',
    ],
    stats: [
      { value: '12', label: 'ANNÉES DE PRATIQUE' },
      { value: '38', label: 'PROJETS LIVRÉS' },
      { value: '9', label: 'PAYS' },
      { value: '4', label: 'DISCIPLINES' },
    ],
    values: [
      { title: 'RECHERCHE', body: 'Un tiers du studio travaille sur des prototypes qui ne seront peut-être jamais montrés.' },
      { title: 'TEMPS RÉEL', body: 'Rien n’est figé : nos pièces réagissent au public, à la météo, à la nuit.' },
      { title: 'SOBRIÉTÉ', body: 'Moins de matériel, plus de précision. La lumière juste plutôt que la lumière forte.' },
    ],
  },
  disciplines: [
    {
      id: 'd1',
      index: '01',
      title: 'ART',
      body: 'Direction artistique, image et narration. Nous dessinons le monde avant de le construire.',
      items: ['Direction artistique', 'Design d’image', 'Scénographie', 'Typographie'],
    },
    {
      id: 'd2',
      index: '02',
      title: 'TECHNOLOGIE',
      body: 'Moteurs temps réel, shaders, pipelines GPU et son spatialisé. La technique comme matériau.',
      items: ['WebGL / WebGPU', 'Shaders & rendu', 'Son spatial', 'Outils sur mesure'],
    },
    {
      id: 'd3',
      index: '03',
      title: 'EXPÉRIENCES',
      body: 'Installations, scènes vivantes et dispositifs immersifs pensés pour être traversés.',
      items: ['Installation', 'Scène & événement', 'Immersif 360°', 'Interaction'],
    },
  ] as Discipline[],
  studio: {
    kicker: 'STUDIO',
    title: 'NOUS FABRIQUONS DES MONDES QUI RÉAGISSENT',
    lead:
      'Une équipe resserrée de huit personnes, installée à Paris. Nous travaillons en cycles courts : prototype, terrain, puis production.',
    offices: [
      { city: 'PARIS', label: 'STUDIO', address: '14 rue de la Clarté, 75011 Paris', coords: '48.8566° N / 2.3522° E' },
      { city: 'MARSEILLE', label: 'ATELIER', address: 'Friche Belle de Mai, 13003 Marseille', coords: '43.3026° N / 5.3691° E' },
    ],
    team: [
      { name: 'CAMILLE ROY', role: 'DIRECTION CRÉATIVE' },
      { name: 'ADRIEN BEAULIEU', role: 'DIRECTION TECHNIQUE' },
      { name: 'NADIA EL AMRANI', role: 'CHEFFE DE PROJET' },
      { name: 'THEO VASSEUR', role: 'RENDU TEMPS RÉEL' },
      { name: 'LOUISE MERCIER', role: 'SON & ESPACE' },
      { name: 'MARC ONFRAY', role: 'SCÉNOGRAPHIE' },
    ],
    process: [
      { step: '01', title: 'ÉCOUTE', body: 'Deux semaines pour comprendre le terrain, les contraintes et l’envie réelle.' },
      { step: '02', title: 'PROTOTYPE', body: 'Une maquette temps réel jouable, testée devant un vrai public.' },
      { step: '03', title: 'FABRICATION', body: 'Production, intégration matérielle, réglages sur site, nuit après nuit.' },
      { step: '04', title: 'VIE DE L’ŒUVRE', body: 'Maintenance, captation et documentation pour que la pièce continue de tourner.' },
    ],
  },
  contact: {
    kicker: 'CONTACT / RECRUTEMENT',
    title: 'PARLONS-EN',
    lead: 'Un projet, une résidence, une candidature ? Écrivez-nous : nous répondons à chaque message en moins d’une semaine.',
    email: 'bonjour@lucide.studio',
    recruit: 'jobs@lucide.studio',
    phone: '+33 1 84 80 12 40',
    hours: 'LUN — VEN, 9H — 19H (CET)',
    subjects: ['Nouveau projet', 'Installation / scène', 'Recherche & développement', 'Candidature spontanée'] as string[],
    socials: [
      { label: 'INSTAGRAM', href: 'https://instagram.com' },
      { label: 'VIMEO', href: 'https://vimeo.com' },
      { label: 'LINKEDIN', href: 'https://linkedin.com' },
      { label: 'GITHUB', href: 'https://github.com' },
    ],
    newsletter: {
      title: 'LETTRE DU STUDIO',
      body: 'Six envois par an. Des images, des prototypes, aucun remplissage.',
    },
  },
  footer: {
    columns: [
      { title: 'NAVIGATION', links: [
        { label: 'Top', href: '#top' },
        { label: 'Actualités', href: '#actualites' },
        { label: 'Projets', href: '#projets' },
        { label: 'À propos', href: '#a-propos' },
      ] },
      { title: 'STUDIO', links: [
        { label: 'Studio', href: '#studio' },
        { label: 'Contact', href: '#contact' },
        { label: 'Recrutement', href: '#contact' },
      ] },
      { title: 'LIENS', links: [
        { label: 'Instagram', href: 'https://instagram.com' },
        { label: 'Vimeo', href: 'https://vimeo.com' },
        { label: 'LinkedIn', href: 'https://linkedin.com' },
      ] },
    ],
    legal: [
      { label: 'Politique de confidentialité', href: '#contact' },
      { label: 'Mentions légales', href: '#contact' },
    ],
    copyright: '©2026 LUCIDE STUDIO',
  },
} as const

export type Site = typeof site
