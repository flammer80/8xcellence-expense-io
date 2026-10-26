import { ForbiddenError, InvalidInputError, NotFoundError } from './errors'
import type { User } from './User'

/**
 * Règle n°6 : rattacher un utilisateur à son manager (ou le détacher).
 *
 * - Seul un RH rattache, et seulement dans sa propre entreprise.
 * - La cible est un employé ou un manager de cette entreprise.
 * - Le manager choisi a le rôle manager, dans la même entreprise, et n'est
 *   pas la cible elle-même.
 * - Aucun cycle : la cible ne doit pas figurer parmi les supérieurs du
 *   manager choisi (A → B → A, ou plus long).
 *
 * Fonction pure : elle reçoit l'annuaire de l'entreprise et ne lit rien.
 */
export const ManagerAssignment = {
  /**
   * @param colleagues annuaire de l'entreprise de l'acteur.
   * @returns la cible, rattachée au nouveau manager.
   * @throws ForbiddenError si l'acteur n'est pas RH ;
   *   NotFoundError si la cible n'est pas un employé ou manager de son entreprise ;
   *   InvalidInputError (`managerId`) si le manager choisi est invalide ou crée un cycle.
   */
  apply(actor: User, targetId: string, managerId: string | null, colleagues: User[]): User {
    if (!actor.isHrAdmin()) {
      throw new ForbiddenError('Seul un RH peut rattacher un utilisateur à un manager.')
    }
    const byId = new Map(colleagues.filter((u) => u.worksFor(actor.companyId)).map((u) => [u.id, u]))

    const target = byId.get(targetId)
    if (!target || target.isHrAdmin()) throw new NotFoundError('Utilisateur', targetId)
    if (managerId === null) return target.withManager(null)

    const manager = byId.get(managerId)
    if (!manager || manager.role !== 'manager') {
      throw new InvalidInputError('managerId', "doit désigner un manager de l'entreprise")
    }
    if (manager.id === target.id) {
      throw new InvalidInputError('managerId', 'un utilisateur ne peut pas être son propre manager')
    }
    if (isAmongSuperiors(target.id, manager, byId)) {
      throw new InvalidInputError('managerId', 'ce rattachement créerait un cycle hiérarchique')
    }
    return target.withManager(manager.id)
  },
}

/** `candidateId` est-il `from` ou l'un de ses supérieurs ? S'arrête même si un cycle existe déjà. */
function isAmongSuperiors(candidateId: string, from: User, byId: Map<string, User>): boolean {
  const seen = new Set<string>()
  let current: User | undefined = from
  while (current && !seen.has(current.id)) {
    if (current.id === candidateId) return true
    seen.add(current.id)
    current = current.managerId ? byId.get(current.managerId) : undefined
  }
  return false
}
