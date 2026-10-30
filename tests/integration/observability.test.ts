import { trace } from '@opentelemetry/api'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as decide } from '@/app/api/expense-notes/[id]/decision/route'
import { GET as ready } from '@/app/api/health/ready/route'
import { readOutboxStats, readPendingNotesByAge } from '@/infrastructure/postgres/operationalStats'
import { pingStorage } from '@/lib/storage'
import { createNote, createOrg } from '../helpers/factories'
import { params, request } from '../helpers/http'
import { installTestTracing } from '../helpers/otel'
import { drainOutbox, outboxRows } from '../helpers/outbox'
import { ownerPool } from '../helpers/owner-pool'
import { signInAs } from '../helpers/session'

// ADR 0011 : une décision et la notification qu'elle déclenche forment une
// seule trace, de la requête HTTP jusqu'au worker de l'outbox.

const tracing = installTestTracing()
afterAll(() => tracing.uninstall())
beforeEach(() => tracing.exporter.reset())

describe('observabilité — de la requête au worker', () => {
  it('une décision et son traitement asynchrone partagent la même trace', async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.manager)

    // Le span racine joue le rôle du span HTTP posé par l'instrumentation.
    const traceId = await trace.getTracer('test').startActiveSpan('POST /api/expense-notes/{id}/decision', async (span) => {
      const response = await decide(
        request(`/api/expense-notes/${note.id}/decision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision: 'approved' }),
        }),
        params({ id: note.id })
      )
      expect(response.status).toBe(200)
      span.end()
      return span.spanContext().traceId
    })

    const [event] = await outboxRows()
    expect(event.traceparent).toMatch(new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`))

    await drainOutbox()

    const spans = tracing.exporter.getFinishedSpans()
    const useCase = spans.find((span) => span.name === 'usecase DecideExpenseNote')
    const consumer = spans.find((span) => span.name === 'outbox process ExpenseNoteDecided')
    expect(useCase?.spanContext().traceId).toBe(traceId)
    expect(useCase?.attributes).toMatchObject({ 'expense.note.id': note.id, 'expense.company.id': org.companyId })
    expect(consumer?.spanContext().traceId).toBe(traceId)
    expect(consumer?.attributes['outbox.outcome']).toBe('processed')
  })
})

describe('statistiques d’exploitation (rôle expense_worker)', () => {
  it('file vide : rien en attente, aucun retard', async () => {
    expect(await readOutboxStats()).toEqual({ pending: 0, oldestPendingAgeSeconds: 0, deadLetters: 0 })
  })

  it('lit l’état de la file : en attente, retard du plus vieux message, lettres mortes', async () => {
    const org = await createOrg()
    const insert = `INSERT INTO outbox (id, company_id, type, version, payload, occurred_at, dead_at)
                    VALUES (gen_random_uuid(), $1, 'ExpenseNoteSubmitted', 1, '{}', $2, $3)`
    await ownerPool().query(insert, [org.companyId, new Date(Date.now() - 10 * 60_000), null])
    await ownerPool().query(insert, [org.companyId, new Date(), new Date()])

    expect(await readOutboxStats()).toEqual({ pending: 1, oldestPendingAgeSeconds: expect.any(Number), deadLetters: 1 })
    expect((await readOutboxStats()).oldestPendingAgeSeconds).toBeGreaterThanOrEqual(600)
  })

  it('compte les notes en attente par tranche d’âge, sans rien lire d’autre', async () => {
    const org = await createOrg()
    const fresh = await createNote(org.employee.id)
    const old = await createNote(org.employee.id)
    await ownerPool().query(`UPDATE expense_notes SET created_at = now() - interval '10 days' WHERE id = $1`, [old.id])
    expect(fresh.id).not.toBe(old.id)

    const buckets = await readPendingNotesByAge()

    expect(Object.keys(buckets).sort()).toEqual(['1d_3d', '3d_7d', 'gt_7d', 'lt_1d'])
    expect(buckets.lt_1d).toBeGreaterThanOrEqual(1)
    expect(buckets.gt_7d).toBeGreaterThanOrEqual(1)
  })

  it('le rôle du worker ne peut toujours pas lire les notes elles-mêmes', async () => {
    const { getWorkerPool } = await import('@/lib/db')
    await expect(getWorkerPool().query('SELECT id FROM expense_notes LIMIT 1')).rejects.toThrow(/permission denied/)
  })
})

describe('GET /api/health/ready (vraie base)', () => {
  it('répond 200 quand Postgres répond, avec le rôle applicatif', async () => {
    const response = await ready()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ready', checks: { postgres: 'up', storage: 'up' } })
  })

  it('répond 503 quand le stockage ne répond pas', async () => {
    vi.mocked(pingStorage).mockRejectedValueOnce(new Error('NoSuchBucket'))
    const response = await ready()
    expect(response.status).toBe(503)
    expect((await response.json()).checks).toEqual({ postgres: 'up', storage: 'down' })
  })
})
