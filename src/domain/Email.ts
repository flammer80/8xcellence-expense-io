/**
 * Forme canonique d'une adresse email : sans espaces autour, en minuscules.
 * Deux saisies qui ne diffèrent que par la casse désignent le même compte
 * (S9) ; la colonne `users.email` est en `citext` pour la même raison.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}
