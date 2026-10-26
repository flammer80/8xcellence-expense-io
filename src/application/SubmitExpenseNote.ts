import { NotFoundError } from '@/domain/errors'
import { expenseNoteSubmitted } from '@/domain/events'
import { ExpenseDate } from '@/domain/ExpenseDate'
import { ExpenseNote } from '@/domain/ExpenseNote'
import { Money } from '@/domain/Money'
import { ReceiptFile } from '@/domain/ReceiptFile'
import { receiptKeyFor } from '@/domain/ReceiptKey'
import type { ExpenseNoteRepository } from './ports/ExpenseNoteRepository'
import type { ReceiptStorage } from './ports/ReceiptStorage'
import type { UserRepository } from './ports/UserRepository'

export interface SubmitExpenseNoteInput {
  /** Utilisateur connecté, auteur de la note (tous les rôles, règle n°1). */
  actorId: string
  amount: number
  /** Date de la dépense, `YYYY-MM-DD`. */
  expenseDate: string
  description: string
  receipt: {
    bytes: Buffer
    /** Type MIME annoncé par le client ; vérifié contre le contenu du fichier. */
    declaredType: string
  }
}

/**
 * Cas d'usage : un utilisateur soumet une note de frais avec son reçu.
 *
 * Invariant : **aucune note sans reçu** (ARC-06). L'ordre le garantit sans
 * transaction distribuée (ADR 0006) :
 * 1. tout valider, puis générer l'UUID de la note, dont dérive la clé du reçu ;
 * 2. déposer le reçu ;
 * 3. insérer la note, en une seule écriture qui porte déjà la clé, avec
 *    l'événement `ExpenseNoteSubmitted` dans la même transaction (ADR 0007) ;
 * 4. si l'insertion échoue, supprimer le reçu déposé (compensation).
 *
 * Si l'envoi échoue, rien n'est écrit en base. Si la compensation échoue
 * aussi, il reste un fichier orphelin, invisible et sans effet métier : c'est
 * le sens d'échec qu'on accepte.
 *
 * Préconditions : `actorId` est authentifié ; son entreprise est relue en base.
 * Erreurs :
 * - `InvalidInputError` : montant, date, description ou reçu invalide (champ
 *   `amount`, `expenseDate`, `description`, `receipt.type` ou `receipt.size`) ;
 * - `NotFoundError` : l'acteur n'existe plus ;
 * - toute erreur du stockage ou de la base, propagée après compensation.
 */
export class SubmitExpenseNote {
  constructor(
    private readonly notes: ExpenseNoteRepository,
    private readonly users: UserRepository,
    private readonly receipts: ReceiptStorage,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID()
  ) {}

  async execute({ actorId, amount, expenseDate, description, receipt }: SubmitExpenseNoteInput): Promise<ExpenseNote> {
    const money = Money.fromDecimal(amount)
    const date = ExpenseDate.parse(expenseDate)
    const file = ReceiptFile.from(receipt.bytes, receipt.declaredType)

    const author = await this.users.findById(actorId, actorId)
    if (!author) throw new NotFoundError('Utilisateur', actorId)

    const id = this.newId()
    const note = ExpenseNote.submit({
      id,
      userId: author.id,
      companyId: author.companyId,
      amount: money,
      expenseDate: date,
      description,
      receiptKey: receiptKeyFor(author.companyId, id, file.extension),
      createdAt: this.now(),
    })

    await this.receipts.upload(note.receiptKey, receipt.bytes, file.contentType)
    try {
      return await this.notes.add(note, actorId, [expenseNoteSubmitted(note, this.newId())])
    } catch (error) {
      // Compensation au mieux : l'erreur d'origine est celle qui compte.
      await this.receipts.delete(note.receiptKey).catch(() => {})
      throw error
    }
  }
}
