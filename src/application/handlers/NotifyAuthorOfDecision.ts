import type { ExpenseNoteDecided } from '@/domain/events'
import type { MessageHandler } from '../OutboxWorker'
import type { NotificationPort } from '../ports/NotificationPort'

/**
 * Consommateur de `ExpenseNoteDecided` (v1) : prévient l'auteur de la note.
 *
 * Idempotent : l'id de l'événement sert de clé, un message rejoué ne crée
 * pas de seconde notification.
 */
export class NotifyAuthorOfDecision implements MessageHandler<ExpenseNoteDecided> {
  constructor(private readonly notifications: NotificationPort) {}

  async handle(event: ExpenseNoteDecided): Promise<void> {
    await this.notifications.notifyDecision({
      eventId: event.id,
      recipientId: event.payload.authorId,
      noteId: event.payload.noteId,
      noteDescription: event.payload.description,
      decision: event.payload.decision,
      rejectionReason: event.payload.rejectionReason,
    })
  }
}
