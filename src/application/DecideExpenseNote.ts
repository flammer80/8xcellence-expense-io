import { ApprovalPolicy } from '@/domain/ApprovalPolicy'
import { AlreadyDecidedError, InvalidInputError, NotFoundError } from '@/domain/errors'
import { expenseNoteDecided } from '@/domain/events'
import type { ExpenseNote, ExpenseNoteDecision } from '@/domain/ExpenseNote'
import type { ExpenseNoteRepository } from './ports/ExpenseNoteRepository'
import type { UserRepository } from './ports/UserRepository'

export interface DecideExpenseNoteInput {
  noteId: string
  /** Utilisateur connecté qui tranche. */
  actorId: string
  decision: ExpenseNoteDecision
  /** Motif facultatif ; refusé pour une approbation. */
  reason?: string | null
}

/**
 * Cas d'usage : un validateur approuve ou rejette une note de frais.
 *
 * Seule implémentation de la décision : la route `POST /api/expense-notes/{id}/decision`
 * et les 4 anciennes routes approve/reject l'appellent toutes.
 *
 * Émet `ExpenseNoteDecided`, enregistré avec la décision ; une décision
 * refusée (409 compris) n'émet rien. L'auteur est prévenu par le worker.
 *
 * Préconditions : `actorId` est authentifié. Son rôle et son rattachement sont
 * relus en base, pas lus dans la session.
 * Erreurs :
 * - `NotFoundError` : note ou acteur inexistant, ou note d'une autre entreprise ;
 * - `ForbiddenError` : l'acteur n'est pas le validateur désigné (ou c'est sa note) ;
 * - `AlreadyDecidedError` : la note est déjà tranchée, y compris par une
 *   décision concurrente ;
 * - `InvalidInputError` : motif fourni pour une approbation, ou trop long.
 */
export class DecideExpenseNote {
  constructor(
    private readonly notes: ExpenseNoteRepository,
    private readonly users: UserRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID()
  ) {}

  async execute({ noteId, actorId, decision, reason }: DecideExpenseNoteInput): Promise<ExpenseNote> {
    if (decision === 'approved' && reason?.trim()) {
      throw new InvalidInputError('reason', "un motif n'accompagne qu'un rejet")
    }

    const actor = await this.users.findById(actorId, actorId)
    if (!actor) throw new NotFoundError('Utilisateur', actorId)

    const note = await this.notes.findById(noteId, actorId)
    if (!note) throw new NotFoundError('Note de frais', noteId)

    const author = await this.users.findById(note.userId, actorId)
    if (!author) throw new NotFoundError('Note de frais', noteId)

    // L'autorisation passe avant l'état : on ne révèle pas qu'une note qu'on
    // n'a pas le droit de voir est déjà tranchée.
    ApprovalPolicy.assertCanDecide(actor, author, noteId)
    if (!note.canBeDecided()) throw new AlreadyDecidedError(noteId)

    const decided =
      decision === 'approved'
        ? note.approve(actor.id, this.now())
        : note.reject(actor.id, this.now(), reason)
    return this.notes.saveDecision(decided, actorId, [expenseNoteDecided(decided, this.newId())])
  }
}
