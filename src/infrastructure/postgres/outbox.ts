import { context, propagation } from '@opentelemetry/api'
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
  const traceparent = currentTraceparent()
  for (const message of messages) {
    await client.query(
      `INSERT INTO outbox (id, company_id, type, version, payload, correlation_id, traceparent, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        message.id,
        message.companyId,
        message.type,
        message.version,
        JSON.stringify(message.payload),
        correlationId,
        traceparent,
        message.occurredAt,
      ]
    )
  }
}

/** Contexte de trace W3C courant (`traceparent`), ou `null` hors trace. */
function currentTraceparent(): string | null {
  const carrier: Record<string, string> = {}
  propagation.inject(context.active(), carrier)
  return carrier.traceparent ?? null
}
