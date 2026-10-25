/**
 * Prévient l'auteur d'une note qu'elle a été tranchée.
 *
 * Implémentation : `ConsoleNotificationAdapter`. Pas encore branché : la
 * notification arrive avec les événements de domaine et l'outbox (étape 5).
 */
export interface NotificationPort {
  notifyDecision(userId: string, noteId: string, decision: 'approved' | 'rejected'): Promise<void>
}
