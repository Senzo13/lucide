/**
 * The giant typographic layer that lives *inside* the room — the reference's
 * enormous word parked on the far wall that changes at every chapter (ALCHE →
 * WORKS …) and gets refracted by the glass object in front of it.
 *
 * One word per section: the world morphs, and so does the lettering.
 */
export const WORD_BY_SECTION: Record<string, string> = {
  top: 'LUCIDE',
  actualites: 'ACTUALITÉS',
  projets: 'PROJETS',
  'a-propos': 'CLARTÉ',
  studio: 'STUDIO',
  contact: 'CONTACT',
  footer: 'LUCIDE',
}

/** every word the wall can display, in the order they are first needed */
export const WORDS = Array.from(new Set(Object.values(WORD_BY_SECTION)))

export const wordForSection = (id: string) => WORD_BY_SECTION[id] ?? 'LUCIDE'
