import { ApprovalPolicy } from '@/domain/ApprovalPolicy'
import type { ExpenseNote } from '@/domain/ExpenseNote'
import type { ExpenseNoteRepository } from './ports/ExpenseNoteRepository'
import type { UserRepository } from './ports/UserRepository'

export interface ListPendingApprovalsInput {
  /** Utilisateur connecté (manager ou RH). */
  actorId: string
}

/**
 * Cas d'usage : la file d'attente d'un validateur, c'est-à-dire les notes en
 * attente qu'il a le droit de trancher, les plus anciennes d'abord.
 *
 * Les auteurs sont filtrés par l'`ApprovalPolicy` elle-même, et non par un
 * `WHERE` recopié : la liste et la décision ne peuvent pas diverger.
 * - Un manager voit les notes de ses subordonnés directs.
 * - Un RH voit celles des utilisateurs sans manager de son entreprise
 *   (managers racine, employés non rattachés, autres RH).
 *
 * Erreurs : aucune ; une liste vide si l'acteur n'existe pas ou n'a rien à
 * trancher.
 */
export class ListPendingApprovals {
  constructor(
    private readonly notes: ExpenseNoteRepository,
    private readonly users: UserRepository
  ) {}

  async execute({ actorId }: ListPendingApprovalsInput): Promise<ExpenseNote[]> {
    const actor = await this.users.findById(actorId, actorId)
    if (!actor) return []

    const colleagues = await this.users.listByCompany(actor.companyId, actorId)
    const authorIds = colleagues
      .filter((author) => ApprovalPolicy.canDecide(actor, author))
      .map((author) => author.id)
    if (authorIds.length === 0) return []

    return this.notes.listPendingByAuthors(authorIds, actorId)
  }
}
