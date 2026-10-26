import type { UserRole } from '@/domain/User'
import { getPool } from '@/lib/db'

// Les deux seuls accès à la base avant authentification. Aucun utilisateur
// n'est encore connu, donc aucune policy RLS ne peut filtrer : ils passent par
// des fonctions SQL `SECURITY DEFINER` au périmètre fermé (migration 0004,
// ADR 0005), plutôt que par une connexion capable de tout lire.

export interface Credentials {
  id: string
  email: string
  passwordHash: string
  role: UserRole
}

/** Identifiants du compte `email` (insensible à la casse), ou `null`. */
export async function findCredentialsByEmail(email: string): Promise<Credentials | null> {
  const result = await getPool().query<{ id: string; email: string; password_hash: string; role: UserRole }>(
    'SELECT id, email, password_hash, role FROM app_find_credentials($1)',
    [email]
  )
  const row = result.rows[0]
  return row ? { id: row.id, email: row.email, passwordHash: row.password_hash, role: row.role } : null
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
 * Crée le compte et, si besoin, son entreprise, en une transaction. Le
 * premier inscrit d'un domaine devient RH, les suivants employés (règle
 * historique, en attente de la décision produit R9).
 * @throws EmailAlreadyRegisteredError si l'email est déjà pris.
 */
export async function registerUser(input: {
  name: string
  email: string
  passwordHash: string
}): Promise<{ id: string; role: UserRole }> {
  try {
    const result = await getPool().query<{ user_id: string; user_role: UserRole }>(
      'SELECT user_id, user_role FROM app_register_user($1, $2, $3)',
      [input.name, input.email, input.passwordHash]
    )
    return { id: result.rows[0].user_id, role: result.rows[0].user_role }
  } catch (error) {
    if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw new EmailAlreadyRegisteredError()
    throw error
  }
}
