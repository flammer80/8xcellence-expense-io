import type { DecisionNotification, Notification, NotificationPort } from '@/application/ports/NotificationPort'

/** Adaptateur de test du `NotificationPort` : mêmes garanties d'idempotence que Postgres. */
export class InMemoryNotificationAdapter implements NotificationPort {
  private readonly byEventId = new Map<string, DecisionNotification & { createdAt: Date }>()

  constructor(private readonly now: () => Date = () => new Date()) {}

  async notifyDecision(notification: DecisionNotification): Promise<void> {
    if (!this.byEventId.has(notification.eventId)) {
      this.byEventId.set(notification.eventId, { ...notification, createdAt: this.now() })
    }
  }

  async listRecent(recipientId: string, limit: number): Promise<Notification[]> {
    return [...this.byEventId.values()]
      .filter((n) => n.recipientId === recipientId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((n) => ({
        id: n.eventId,
        noteId: n.noteId,
        noteDescription: n.noteDescription,
        decision: n.decision,
        rejectionReason: n.rejectionReason,
        createdAt: n.createdAt,
      }))
  }
}
