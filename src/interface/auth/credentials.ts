import type { UserRole } from '@/domain/User'
import { normalizeEmail } from '@/domain/Email'

// Logique de connexion par identifiants, sortie de la configuration NextAuth
// pour être testée sans base ni framework (ADR 0009).

/** Limites de tentatives (S9) : par email pour le login, par IP pour l'inscription. */
export const LOGIN_RATE_LIMIT = { max: 10, windowSeconds: 15 * 60 } as const
export const SIGNUP_RATE_LIMIT = { max: 5, windowSeconds: 60 * 60 } as const

export interface CredentialsDeps {
  findCredentialsByEmail(
    email: string
  ): Promise<{ id: string; email: string; passwordHash: string; role: UserRole; emailVerified: boolean } | null>
  consumeAuthAttempt(key: string, max: number, windowSeconds: number): Promise<boolean>
  comparePassword(password: string, hash: string): Promise<boolean>
}

export type AuthorizeResult =
  | { ok: true; user: { id: string; email: string; role: UserRole } }
  | { ok: false; reason: 'invalid_credentials' | 'rate_limited' | 'email_not_verified' }

/**
 * Vérifie des identifiants.
 *
 * - Chaque tentative compte, réussie ou non, pour l'email visé : au-delà de
 *   10 en 15 minutes, `rate_limited`, même avec le bon mot de passe.
 * - `email_not_verified` n'est renvoyé qu'**après** un mot de passe correct :
 *   il ne révèle rien à qui ne connaît pas le mot de passe.
 * - Email inconnu et mauvais mot de passe donnent la même réponse (pas
 *   d'énumération de comptes).
 */
export async function authorizeCredentials(
  input: { email: unknown; password: unknown },
  deps: CredentialsDeps
): Promise<AuthorizeResult> {
  if (typeof input.email !== 'string' || typeof input.password !== 'string') {
    return { ok: false, reason: 'invalid_credentials' }
  }
  const email = normalizeEmail(input.email)

  const allowed = await deps.consumeAuthAttempt(`login:${email}`, LOGIN_RATE_LIMIT.max, LOGIN_RATE_LIMIT.windowSeconds)
  if (!allowed) return { ok: false, reason: 'rate_limited' }

  const account = await deps.findCredentialsByEmail(email)
  if (!account || !(await deps.comparePassword(input.password, account.passwordHash))) {
    return { ok: false, reason: 'invalid_credentials' }
  }
  if (!account.emailVerified) return { ok: false, reason: 'email_not_verified' }

  return { ok: true, user: { id: account.id, email: account.email, role: account.role } }
}

/** Message affiché sur la page de connexion pour chaque refus. */
export const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Email ou mot de passe incorrect.',
  rate_limited: 'Trop de tentatives. Réessaie dans quelques minutes.',
  email_not_verified: "Confirme d'abord ton adresse email, avec le lien reçu à l'inscription.",
}
