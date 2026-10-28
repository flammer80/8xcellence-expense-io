import { metrics } from '@opentelemetry/api'
import { getPool, getWorkerPool } from '@/lib/db'
import { logger } from '@/lib/logger'
import { readOutboxStats, readPendingNotesByAge } from '../postgres/operationalStats'

/**
 * Jauges lues à chaque export de métriques (ADR 0011) : connexions des deux
 * pools Postgres, état de la file de l'outbox, notes en attente par âge.
 * À appeler une fois, après le démarrage du SDK OpenTelemetry.
 */
export function registerBackgroundMetrics(): void {
  const meter = metrics.getMeter('expense-io')

  const poolConnections = meter.createObservableGauge('db.client.connections', {
    description: 'Connexions des pools Postgres, par pool et état',
  })
  const outboxPending = meter.createObservableGauge('outbox.pending', { description: 'Messages en attente' })
  const outboxLag = meter.createObservableGauge('outbox.oldest_pending_age', {
    description: 'Âge du plus vieux message en attente (retard de la file)',
    unit: 's',
  })
  const outboxDead = meter.createObservableGauge('outbox.dead_letters', { description: 'Messages en lettre morte' })
  const pendingNotes = meter.createObservableGauge('expense.notes.pending', {
    description: 'Notes en attente de décision, par tranche d’âge',
  })

  meter.addBatchObservableCallback(
    async (result) => {
      for (const [name, pool] of [
        ['app', getPool()],
        ['worker', getWorkerPool()],
      ] as const) {
        result.observe(poolConnections, pool.totalCount - pool.idleCount, { pool: name, state: 'used' })
        result.observe(poolConnections, pool.idleCount, { pool: name, state: 'idle' })
        result.observe(poolConnections, pool.waitingCount, { pool: name, state: 'waiting' })
      }
      try {
        const outbox = await readOutboxStats()
        result.observe(outboxPending, outbox.pending)
        result.observe(outboxLag, outbox.oldestPendingAgeSeconds)
        result.observe(outboxDead, outbox.deadLetters)
        for (const [bucket, count] of Object.entries(await readPendingNotesByAge())) {
          result.observe(pendingNotes, count, { age: bucket })
        }
      } catch (error) {
        // Base indisponible : on n'observe rien plutôt que des zéros trompeurs.
        logger.warn({ err: error, event: 'background-metrics-failed' }, 'background-metrics-failed')
      }
    },
    [poolConnections, outboxPending, outboxLag, outboxDead, pendingNotes]
  )
}
