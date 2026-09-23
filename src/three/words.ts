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

/**
 * Whether a chapter wants the wall word at all.
 *
 * The key visual has its own wordmark — the crisp DOM one the gem refracts —
 * so the wall stays empty there: two giant LUCIDE on top of each other read as
 * a printing mistake, not as depth. The outro is off for the same reason (the
 * footer draws its own). Every other chapter keeps it: that giant word is what
 * makes the dive feel like a room.
 *
 * (How the ink is drawn is the world's business, not the chapter's: see the
 * `sheet` rule in `WordLayer`.)
 */
export const WORD_WEIGHT: Record<string, number> = {
  top: 0,
  actualites: 1,
  projets: 1,
  'a-propos': 1,
  studio: 1,
  contact: 1,
  footer: 0,
}

export const wordWeight = (id: string) => WORD_WEIGHT[id] ?? 1
