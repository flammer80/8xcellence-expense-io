import { ApprovalPolicy } from '@/domain/ApprovalPolicy'
import { NotFoundError } from '@/domain/errors'
import type { ExpenseNoteRepository } from './ports/ExpenseNoteRepository'
import type { ReceiptStorage } from './ports/ReceiptStorage'
import type { UserRepository } from './ports/UserRepository'

export interface GetReceiptUrlInput {
  noteId: string
  /** Utilisateur connecté qui demande le reçu. */
  actorId: string
}

/** Durée de validité de l'URL pré-signée, en secondes. */
export const RECEIPT_URL_TTL_SECONDS = 300

/**
 * Cas d'usage : obtenir une URL temporaire pour consulter le reçu d'une note.
 *
 * Autorisé pour l'auteur de la note et pour son validateur désigné
 * (`ApprovalPolicy.canViewReceipt`), quel que soit le statut de la note.
 *
 * Erreurs : `NotFoundError` si la note n'existe pas **ou** si l'acteur n'a
 * pas le droit de la voir. On ne distingue pas les deux cas, pour ne pas
 * révéler l'existence d'une note (SEC-04).
 */
export class GetReceiptUrl {
  constructor(
    private readonly notes: ExpenseNoteRepository,
    private readonly users: UserRepository,
    private readonly receipts: ReceiptStorage
  ) {}

  async execute({ noteId, actorId }: GetReceiptUrlInput): Promise<string> {
    const actor = await this.users.findById(actorId, actorId)
    const note = actor ? await this.notes.findById(noteId, actorId) : null
    const author = note ? await this.users.findById(note.userId, actorId) : null
    if (!actor || !note || !author || !ApprovalPolicy.canViewReceipt(actor, author)) {
      throw new NotFoundError('Note de frais', noteId)
    }
    return this.receipts.getSignedUrl(note.receiptKey, RECEIPT_URL_TTL_SECONDS)
  }
}
