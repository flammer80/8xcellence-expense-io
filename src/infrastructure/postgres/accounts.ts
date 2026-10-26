import { randomUUID } from 'node:crypto'
import type { UserRole } from '@/domain/User'
import { currentCorrelationId } from '@/lib/correlation'
import { getPool } from '@/lib/db'

// Les accès à la base avant authentification. Aucun utilisateur n'est encore
// connu, donc aucune policy RLS ne peut filtrer : ils passent par des
// fonctions SQL `SECURITY DEFINER` au périmètre fermé (migrations 0004 et
// 0006, ADR 0005 et 0009), plutôt que par une connexion capable de tout lire.

export interface Credentials {
  id: string
  email: string
  passwordHash: string
  role: UserRole
  /** L'adresse a été confirmée par le lien envoyé à l'inscription. */
  emailVerified: boolean
}

/** Identifiants du compte `email` (insensible à la casse), ou `null`. */
export async function findCredentialsByEmail(email: string): Promise<Credentials | null> {
  const result = await getPool().query<{
    id: string
    email: string
    password_hash: string
    role: UserRole
    email_verified: boolean
  }>('SELECT id, email, password_hash, role, email_verified FROM app_find_credentials($1)', [email])
  const row = result.rows[0]
  return row
    ? {
        id: row.id,
        email: row.email,
        passwordHash: row.password_hash,
        role: row.role,
        emailVerified: row.email_verified,
      }
    : null
}

/** L'email est déjà utilisé par un autre compte. */
export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('Un compte existe déjà avec cet email.')
    this.name = 'EmailAlreadyRegisteredError'
  }
}

const UNIQUE_VIOLATION = '23505'

/**
 * Crée le compte, **non vérifié**, et si besoin son entreprise, en une
 * transaction qui dépose aussi le message `EmailVerificationRequested` dans
 * l'outbox. Le premier inscrit d'un domaine devient RH, les suivants
 * employés.
 * @param input.verificationToken jeton aléatoire d'au moins 32 caractères ;
 *   seule son empreinte est stockée.
 * @throws EmailAlreadyRegisteredError si l'email est déjà pris.
 */
export async function registerUser(input: {
  name: string
  email: string
  passwordHash: string
  verificationToken: string
}): Promise<{ id: string; role: UserRole }> {
  try {
    const result = await getPool().query<{ user_id: string; user_role: UserRole }>(
      'SELECT user_id, user_role FROM app_register_user($1, $2, $3, $4, $5)',
      [input.name, input.email, input.passwordHash, input.verificationToken, currentCorrelationId() ?? randomUUID()]
    )
    return { id: result.rows[0].user_id, role: result.rows[0].user_role }
  } catch (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw new EmailAlreadyRegisteredError()
    throw error
  }
}

/**
 * Confirme l'adresse du compte qui a reçu `token`.
 * @returns `false` si le jeton est inconnu ou expiré (24 h).
 */
export async function verifyEmail(token: string): Promise<boolean> {
  const result = await getPool().query<{ verified: boolean }>('SELECT app_verify_email($1) AS verified', [token])
  return result.rows[0].verified
}

/**
 * Enregistre une tentative pour `key` (ex. `login:alice@acme.fr`).
 * @returns `false` si la limite (`max` tentatives sur `windowSeconds`) est dépassée.
 */
export async function consumeAuthAttempt(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const result = await getPool().query<{ allowed: boolean }>(
    'SELECT app_consume_auth_attempt($1, $2, $3) AS allowed',
    [key, max, windowSeconds]
  )
  return result.rows[0].allowed
}
