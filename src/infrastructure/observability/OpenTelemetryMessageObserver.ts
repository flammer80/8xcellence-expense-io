import { context, propagation, SpanKind, SpanStatusCode } from '@opentelemetry/api'
import type { ClaimedMessage, MessageObserver, MessageOutcome } from '@/application/ports/OutboxStore'
import { runWithCorrelationId } from '@/lib/correlation'
import { appMetrics, tracer } from '@/lib/telemetry'

/**
 * Traite chaque message de l'outbox dans un span `outbox process <type>`,
 * **enfant de la requête HTTP d'origine** (contexte `traceparent` enregistré
 * avec le message) : une décision et la notification qu'elle déclenche
 * forment une seule trace (ADR 0011). Les logs émis pendant le traitement
 * portent l'id de corrélation de cette requête. Mesure aussi la durée et l'issue du
 * traitement, par type de message.
 */
export class OpenTelemetryMessageObserver implements MessageObserver {
  async observe(claimed: ClaimedMessage, process: () => Promise<MessageOutcome>): Promise<MessageOutcome> {
    const { message, attempts, traceparent, correlationId } = claimed
    const parent = traceparent ? propagation.extract(context.active(), { traceparent }) : context.active()
    const attributes = {
      'messaging.system': 'postgres-outbox',
      'messaging.operation.type': 'process',
      'messaging.message.id': message.id,
      'messaging.message.type': message.type,
      'outbox.attempts': attempts,
    }
    const start = performance.now()

    return tracer().startActiveSpan(`outbox process ${message.type}`, { kind: SpanKind.CONSUMER, attributes }, parent, async (span) => {
      let outcome: MessageOutcome | 'crashed' = 'crashed'
      try {
        // Les logs du traitement portent l'id de corrélation de la requête d'origine.
        outcome = await (correlationId ? runWithCorrelationId(correlationId, process) : process())
        span.setAttribute('outbox.outcome', outcome)
        if (outcome === 'retry-scheduled' || outcome === 'dead-letter') span.setStatus({ code: SpanStatusCode.ERROR })
        return outcome
      } catch (error) {
        span.recordException(error instanceof Error ? error : String(error))
        span.setStatus({ code: SpanStatusCode.ERROR })
        throw error
      } finally {
        const metricAttributes = { type: message.type, outcome }
        appMetrics().outboxMessages.add(1, metricAttributes)
        appMetrics().outboxMessageDuration.record((performance.now() - start) / 1000, metricAttributes)
        span.end()
      }
    })
  }
}
