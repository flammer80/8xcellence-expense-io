/**
 * Forme canonique d'une adresse email : sans espaces autour, en minuscules.
 * Deux saisies qui ne diffèrent que par la casse désignent le même compte
 * (S9) ; la colonne `users.email` est en `citext` pour la même raison.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Seule définition d'une adresse valide dans l'application (une partie locale, `@`, un domaine avec un point). */
const EMAIL_PATTERN = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email)
}

/** Domaine d'une adresse valide (`alice@acme.fr` → `acme.fr`), en minuscules. */
export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase()
}

/**
 * Messageries grand public : leurs domaines n'identifient pas une entreprise.
 * Une inscription avec l'un d'eux est refusée, sinon le premier inscrit en
 * `@gmail.com` deviendrait RH de l'entreprise « gmail » et verrait les notes
 * de tous les inscrits suivants (S7, ADR 0009). Liste volontairement courte :
 * elle couvre l'essentiel du trafic et se complète sans changer la règle.
 */
export const PUBLIC_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'outlook.fr',
  'hotmail.com',
  'hotmail.fr',
  'live.com',
  'live.fr',
  'msn.com',
  'yahoo.com',
  'yahoo.fr',
  'icloud.com',
  'me.com',
  'aol.com',
  'gmx.com',
  'gmx.fr',
  'proton.me',
  'protonmail.com',
  'orange.fr',
  'wanadoo.fr',
  'free.fr',
  'sfr.fr',
  'laposte.net',
])

/** L'adresse est valide et son domaine peut identifier une entreprise (pas une messagerie grand public). */
export function isProfessionalEmail(email: string): boolean {
  return isValidEmail(email) && !PUBLIC_EMAIL_DOMAINS.has(emailDomain(email))
}
