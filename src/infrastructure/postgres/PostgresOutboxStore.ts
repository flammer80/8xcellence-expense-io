import type { OutboxMessage } from '@/application/messages'
import type { ClaimedMessage, OutboxStore } from '@/application/ports/OutboxStore'
import { getWorkerPool } from '@/lib/db'

interface OutboxRow {
  id: string
  company_id: string
  type: OutboxMessage['type']
  version: number
  payload: unknown
  correlation_id: string | null
  occurred_at: Date
  attempts: number
}

/**
 * Outbox vue du worker, avec le rôle `expense_worker` : il lit les messages
 * de toutes les entreprises mais ne touche qu'à leur état de livraison.
 *
 * `FOR UPDATE SKIP LOCKED` garantit qu'un message n'est réclamé que par un
 * worker à la fois, même avec plusieurs instances de l'application.
 */
export class PostgresOutboxStore implements OutboxStore {
  async claim(limit: number, leaseSeconds: number): Promise<ClaimedMessage[]> {
    const result = await getWorkerPool().query<OutboxRow>(
      `UPDATE outbox
       SET attempts = attempts + 1, locked_until = now() + make_interval(secs => $2)
       WHERE id IN (
         SELECT id FROM outbox
         WHERE processed_at IS NULL AND dead_at IS NULL
           AND available_at <= now()
           AND (locked_until IS NULL OR locked_until < now())
         ORDER BY occurred_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, company_id, type, version, payload, correlation_id, occurred_at, attempts`,
      [limit, leaseSeconds]
    )
    return result.rows
      .sort((a, b) => a.occurred_at.getTime() - b.occurred_at.getTime())
      .map((row) => ({
        message: {
          id: row.id,
          type: row.type,
          version: row.version,
          companyId: row.company_id,
          occurredAt: row.occurred_at,
          payload: row.payload,
        } as OutboxMessage,
        attempts: row.attempts,
        correlationId: row.correlation_id,
      }))
  }

  async ack(messageId: string): Promise<void> {
    await getWorkerPool().query(
      'UPDATE outbox SET processed_at = now(), locked_until = NULL, last_error = NULL WHERE id = $1',
      [messageId]
    )
  }

  async retry(messageId: string, error: string, availableAt: Date): Promise<void> {
    await getWorkerPool().query(
      'UPDATE outbox SET available_at = $2, last_error = $3, locked_until = NULL WHERE id = $1',
      [messageId, availableAt, error]
    )
  }

  async bury(messageId: string, error: string): Promise<void> {
    await getWorkerPool().query(
      'UPDATE outbox SET dead_at = now(), last_error = $2, locked_until = NULL WHERE id = $1',
      [messageId, error]
    )
  }
}
