import { metrics } from '@opentelemetry/api'
import { MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics'
import { afterAll, describe, expect, it } from 'vitest'
import { registerBackgroundMetrics } from '@/infrastructure/observability/backgroundMetrics'
import { createNote, createOrg } from '../helpers/factories'

// ADR 0011 : les jauges de fond (pools, file de l'outbox, notes en attente)
// sont lues à chaque collecte, avec le rôle `expense_worker`.

/** Lecteur manuel : la collecte est déclenchée par le test. */
class ManualReader extends MetricReader {
  protected async onShutdown(): Promise<void> {}
  protected async onForceFlush(): Promise<void> {}
}

const reader = new ManualReader()
metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }))
registerBackgroundMetrics()
afterAll(() => metrics.disable())

async function gauges(): Promise<Map<string, { attributes: Record<string, unknown>; value: number }[]>> {
  const { resourceMetrics } = await reader.collect()
  const byName = new Map<string, { attributes: Record<string, unknown>; value: number }[]>()
  for (const scope of resourceMetrics.scopeMetrics) {
    for (const metric of scope.metrics) {
      byName.set(
        metric.descriptor.name,
        metric.dataPoints.map((point) => ({ attributes: point.attributes, value: point.value as number }))
      )
    }
  }
  return byName
}

describe('jauges de fond', () => {
  it('publient pools, file de l’outbox et notes en attente par âge', async () => {
    const org = await createOrg()
    await createNote(org.employee.id)

    const collected = await gauges()

    expect(collected.get('db.client.connections')).toEqual(
      expect.arrayContaining([expect.objectContaining({ attributes: { pool: 'worker', state: 'idle' } })])
    )
    expect(collected.get('outbox.pending')).toEqual([{ attributes: {}, value: 0 }])
    expect(collected.get('outbox.oldest_pending_age')).toEqual([{ attributes: {}, value: 0 }])
    expect(collected.get('outbox.dead_letters')).toEqual([{ attributes: {}, value: 0 }])
    expect(collected.get('expense.notes.pending')).toEqual(
      expect.arrayContaining([{ attributes: { age: 'lt_1d' }, value: 1 }, { attributes: { age: 'gt_7d' }, value: 0 }])
    )
  })
})
