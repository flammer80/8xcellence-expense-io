import { ForbiddenError } from '@/domain/errors'
import type { User } from '@/domain/User'
import type { UserRepository } from './ports/UserRepository'

/**
 * Cas d'usage : l'annuaire de l'entreprise, pour que le RH rattache les
 * employés à leur manager. Contient les employés et managers, triés par nom ;
 * les RH n'y figurent pas (on ne les rattache pas).
 *
 * Erreurs : `ForbiddenError` si l'acteur n'est pas RH (rôle relu en base).
 */
export class ListCompanyUsers {
  constructor(private readonly users: UserRepository) {}

  async execute({ actorId }: { actorId: string }): Promise<User[]> {
    const actor = await this.users.findById(actorId, actorId)
    if (!actor?.isHrAdmin()) throw new ForbiddenError("Seul un RH consulte l'annuaire de l'entreprise.")
    const colleagues = await this.users.listByCompany(actor.companyId, actorId)
    return colleagues.filter((user) => !user.isHrAdmin())
  }
}
