import { ForbiddenError, NotFoundError } from './errors'
import type { User } from './User'

/**
 * Pourquoi un utilisateur ne peut pas trancher une note :
 * - `other-company` : la note appartient à une autre entreprise (règle n°7) ;
 * - `own-note` : c'est sa propre note (règle n°4) ;
 * - `not-approver` : même entreprise, mais il n'est pas le validateur désigné.
 */
export type ApprovalRefusal = 'other-company' | 'own-note' | 'not-approver'

/**
 * Seul endroit qui décide qui tranche quelle note (CLAUDE.md §3, ADR 0003).
 *
 * 1. Jamais entre deux entreprises.
 * 2. Jamais sa propre note, ni pour un manager ni pour un RH.
 * 3. L'auteur a un manager : seul ce manager direct tranche.
 * 4. L'auteur n'a pas de manager (manager racine, employé non rattaché, RH) :
 *    un RH de l'entreprise tranche. La note d'un RH revient donc à un *autre*
 *    RH ; s'il est le seul RH de l'entreprise, elle reste en attente.
 *
 * Fonctions pures : l'appelant fournit des `User` relus en base, jamais les
 * rôles du jeton de session.
 */
export const ApprovalPolicy = {
  /** Motif du refus, ou `null` si `actor` peut trancher les notes de `author`. */
  refusalToDecide(actor: User, author: User): ApprovalRefusal | null {
    if (!actor.worksFor(author.companyId)) return 'other-company'
    if (actor.id === author.id) return 'own-note'
    if (author.hasManager()) {
      return actor.id === author.managerId ? null : 'not-approver'
    }
    return actor.isHrAdmin() ? null : 'not-approver'
  },

  canDecide(actor: User, author: User): boolean {
    return ApprovalPolicy.refusalToDecide(actor, author) === null
  },

  /**
   * @throws NotFoundError si la note est d'une autre entreprise (on ne révèle
   *   pas son existence) ;
   * @throws ForbiddenError si l'acteur est de la même entreprise mais n'a pas
   *   le droit de la trancher.
   */
  assertCanDecide(actor: User, author: User, noteId: string): void {
    const refusal = ApprovalPolicy.refusalToDecide(actor, author)
    if (refusal === 'other-company') throw new NotFoundError('Note de frais', noteId)
    if (refusal === 'own-note') throw new ForbiddenError('Personne ne peut trancher sa propre note.')
    if (refusal === 'not-approver') {
      throw new ForbiddenError("Seul le validateur désigné de l'auteur peut trancher cette note.")
    }
  },

  /** Le reçu est visible de son auteur et de quiconque peut trancher la note. */
  canViewReceipt(actor: User, author: User): boolean {
    return actor.id === author.id || ApprovalPolicy.canDecide(actor, author)
  },
}
