import type { User } from '@/domain/User'

/**
 * Lecture des utilisateurs, pour les règles d'autorisation.
 *
 * Les cas d'usage relisent l'acteur ici plutôt que de croire le rôle du
 * jeton de session : un JWT reste valide jusqu'à son expiration, même si le
 * rôle ou le rattachement a changé entre-temps (CLAUDE.md §10).
 *
 * Implémentations : `PostgresUserRepository`, `InMemoryUserRepository`.
 */
export interface UserRepository {
  /** L'utilisateur `userId`, ou `null` s'il n'existe pas. */
  findById(userId: string): Promise<User | null>

  /** Tous les utilisateurs de l'entreprise `companyId`. */
  listByCompany(companyId: string): Promise<User[]>
}
