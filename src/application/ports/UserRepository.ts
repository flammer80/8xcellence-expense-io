import type { User } from '@/domain/User'

/**
 * Lecture des utilisateurs, pour les règles d'autorisation.
 *
 * Les cas d'usage relisent l'acteur ici plutôt que de croire le rôle du
 * jeton de session : un JWT reste valide jusqu'à son expiration, même si le
 * rôle ou le rattachement a changé entre-temps (CLAUDE.md §10).
 *
 * `actorId` désigne l'utilisateur au nom duquel la requête s'exécute ;
 * l'adaptateur Postgres l'expose aux policies RLS, qui limitent la lecture à
 * l'entreprise de l'acteur (ADR 0005).
 *
 * Implémentations : `PostgresUserRepository`, `InMemoryUserRepository`.
 */
export interface UserRepository {
  /** L'utilisateur `userId`, ou `null` s'il n'existe pas (ou est d'une autre entreprise). */
  findById(userId: string, actorId: string): Promise<User | null>

  /** Tous les utilisateurs de l'entreprise `companyId`. */
  listByCompany(companyId: string, actorId: string): Promise<User[]>
}
