import type { DecisionNotification, Notification, NotificationPort } from '@/application/ports/NotificationPort'
import type { ExpenseNoteDecision } from '@/domain/ExpenseNote'
import { withUserScope } from '@/lib/db'

interface NotificationRow {
  id: string
  note_id: string
  note_description: string
  decision: ExpenseNoteDecision
  rejection_reason: string | null
  created_at: Date
}

/**
 * Notifications dans l'application, stockées dans Postgres. Le worker les
 * écrit **au nom du destinataire** : la policy RLS garantit qu'on ne peut
 * notifier quelqu'un que dans sa propre entreprise.
 *
 * Idempotent : `event_id` est unique, un événement rejoué est ignoré.
 * Un envoi par email s'ajouterait comme un autre adaptateur du même port.
 */
export class PostgresNotificationAdapter implements NotificationPort {
  async notifyDecision(notification: DecisionNotification): Promise<void> {
    await withUserScope(notification.recipientId, (client) =>
      client.query(
        `INSERT INTO notifications
           (event_id, user_id, company_id, note_id, note_description, decision, rejection_reason)
         VALUES ($1, $2, app_current_company_id(), $3, $4, $5, $6)
         ON CONFLICT (event_id) DO NOTHING`,
        [
          notification.eventId,
          notification.recipientId,
          notification.noteId,
          notification.noteDescription,
          notification.decision,
          notification.rejectionReason,
        ]
      )
    )
  }

  async listRecent(recipientId: string, limit: number): Promise<Notification[]> {
    return withUserScope(recipientId, async (client) => {
      const result = await client.query<NotificationRow>(
        `SELECT id, note_id, note_description, decision, rejection_reason, created_at
         FROM notifications WHERE user_id = $1
         ORDER BY created_at DESC LIMIT $2`,
        [recipientId, limit]
      )
      return result.rows.map((row) => ({
        id: row.id,
        noteId: row.note_id,
        noteDescription: row.note_description,
        decision: row.decision,
        rejectionReason: row.rejection_reason,
        createdAt: row.created_at,
      }))
    })
  }
}
