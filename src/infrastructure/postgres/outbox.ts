import type { PoolClient } from 'pg'
import type { OutboxMessage } from '@/application/messages'
import { currentCorrelationId } from '@/lib/correlation'

/**
 * Écrit des messages dans l'outbox avec la connexion **de la transaction en
 * cours** : ils n'existent que si cette transaction est validée (pattern
 * outbox, ADR 0007). Pas de `RETURNING` : le rôle applicatif n'a pas le droit
 * de relire l'outbox.
 */
export async function insertOutboxMessages(client: PoolClient, messages: OutboxMessage[]): Promise<void> {
  const correlationId = currentCorrelationId() ?? null
  for (const message of messages) {
    await client.query(
      `INSERT INTO outbox (id, company_id, type, version, payload, correlation_id, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        message.id,
        message.companyId,
        message.type,
        message.version,
        JSON.stringify(message.payload),
        correlationId,
        message.occurredAt,
      ]
    )
  }
}
