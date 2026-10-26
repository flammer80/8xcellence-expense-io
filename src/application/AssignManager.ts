import { ManagerAssignment } from '@/domain/ManagerAssignment'
import { ForbiddenError } from '@/domain/errors'
import type { User } from '@/domain/User'
import type { UserRepository } from './ports/UserRepository'

export interface AssignManagerInput {
  /** RH connecté. */
  actorId: string
  /** Employé ou manager à rattacher. */
  userId: string
  /** Nouveau manager direct, ou `null` pour détacher (l'utilisateur devient racine). */
  managerId: string | null
}

/**
 * Cas d'usage : le RH rattache un utilisateur à son manager (règle n°6).
 * La règle vit dans `ManagerAssignment` (domaine) ; le repository garantit
 * qu'un rattachement concurrent ne crée pas de cycle.
 *
 * Erreurs :
 * - `ForbiddenError` : l'acteur n'est pas RH (rôle relu en base) ;
 * - `NotFoundError` : la cible n'est pas un employé ou manager de son entreprise ;
 * - `InvalidInputError` (`managerId`) : manager invalide, soi-même, ou cycle.
 */
export class AssignManager {
  constructor(private readonly users: UserRepository) {}

  async execute({ actorId, userId, managerId }: AssignManagerInput): Promise<User> {
    const actor = await this.users.findById(actorId, actorId)
    if (!actor) throw new ForbiddenError('Seul un RH peut rattacher un utilisateur à un manager.')

    const colleagues = await this.users.listByCompany(actor.companyId, actorId)
    const reassigned = ManagerAssignment.apply(actor, userId, managerId, colleagues)
    return this.users.saveManager(reassigned, actorId)
  }
}
