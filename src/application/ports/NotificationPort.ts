import type { ExpenseNoteDecision } from '@/domain/ExpenseNote'

/** Ce qu'on annonce à l'auteur d'une note tranchée. */
export interface DecisionNotification {
  /** Événement à l'origine de la notification : clé d'idempotence. */
  eventId: string
  recipientId: string
  noteId: string
  noteDescription: string
  decision: ExpenseNoteDecision
  rejectionReason: string | null
}

/** Notification telle que son destinataire la consulte. */
export interface Notification {
  id: string
  noteId: string
  noteDescription: string
  decision: ExpenseNoteDecision
  rejectionReason: string | null
  createdAt: Date
}

/**
 * Prévient l'auteur d'une note qu'elle a été tranchée, et lui permet de
 * relire ses notifications.
 *
 * `notifyDecision` est **idempotent** : appelé deux fois pour le même
 * `eventId` (message rejoué après un crash), il ne crée qu'une notification.
 *
 * Implémentations : `PostgresNotificationAdapter` (notifications dans
 * l'application), `InMemoryNotificationAdapter` (tests).
 */
export interface NotificationPort {
  notifyDecision(notification: DecisionNotification): Promise<void>

  /** Les `limit` notifications les plus récentes de `recipientId`. */
  listRecent(recipientId: string, limit: number): Promise<Notification[]>
}
