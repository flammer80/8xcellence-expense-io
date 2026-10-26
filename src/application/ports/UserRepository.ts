import type { User } from '@/domain/User'

/**
 * Utilisateurs : lecture pour les règles d'autorisation, et rattachement à
 * un manager (seule modification permise à l'application, ADR 0005).
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

  /**
   * Enregistre le rattachement de `user` (son `managerId`), déjà validé par
   * `ManagerAssignment`.
   *
   * L'adaptateur Postgres sérialise les rattachements d'une même entreprise
   * et revérifie l'absence de cycle dans la transaction : deux rattachements
   * concurrents (A → B et B → A) ne peuvent pas passer tous les deux.
   * @returns l'utilisateur tel qu'enregistré.
   * @throws InvalidInputError (`managerId`) si un rattachement concurrent a
   *   rendu celui-ci cyclique ; NotFoundError si l'utilisateur a disparu.
   */
  saveManager(user: User, actorId: string): Promise<User>
}
