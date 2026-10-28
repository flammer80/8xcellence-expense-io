import { context, propagation, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { OutboxWorker } from '@/application/OutboxWorker'
import type { ClaimedMessage, MessageObserver } from '@/application/ports/OutboxStore'
import { expenseNoteDecided } from '@/domain/events'
import { AlreadyDecidedError } from '@/domain/errors'
import { InMemoryOutboxStore } from '@/infrastructure/in-memory/InMemoryOutboxStore'
import { instrumentUseCase } from '@/infrastructure/observability/instrumentUseCase'
import { OpenTelemetryMessageObserver } from '@/infrastructure/observability/OpenTelemetryMessageObserver'
import { currentCorrelationId } from '@/lib/correlation'
import { anExpenseNote } from '../../helpers/builders'
import { installTestTracing } from '../../helpers/otel'

// ADR 0011 : un span par cas d'usage, sans donnée personnelle, et le
// traitement asynchrone rattaché à la trace de la requête d'origine.

const tracing = installTestTracing()
afterAll(() => tracing.uninstall())
beforeEach(() => tracing.exporter.reset())

const T0 = new Date('2026-10-26T09:00:00.000Z')

describe('instrumentUseCase', () => {
  it('ouvre un span par appel, avec les identifiants et l’entreprise, sans donnée personnelle', async () => {
    const note = anExpenseNote({ userId: 'employee' })
    const onSuccess = vi.fn()
    const useCase = instrumentUseCase('DecideExpenseNote', { execute: async () => note }, { onSuccess })

    const input = { noteId: note.id, actorId: 'manager-1', decision: 'approved', reason: 'RAS', email: 'a@acme.fr' }
    await expect(useCase.execute(input)).resolves.toBe(note)

    const [span] = tracing.exporter.getFinishedSpans()
    expect(span.name).toBe('usecase DecideExpenseNote')
    expect(span.attributes).toEqual({
      'expense.usecase': 'DecideExpenseNote',
      'expense.note.id': note.id,
      'enduser.id': 'manager-1',
      'expense.decision': 'approved',
      'expense.outcome': 'success',
      'expense.company.id': note.companyId,
    })
    expect(onSuccess).toHaveBeenCalledWith(note, input)
  })

  it('une erreur du domaine est un résultat métier : notée, sans marquer le span en erreur', async () => {
    const useCase = instrumentUseCase('DecideExpenseNote', {
      execute: async () => {
        throw new AlreadyDecidedError('déjà tranchée')
      },
    })

    await expect(useCase.execute({ noteId: 'n-1' })).rejects.toBeInstanceOf(AlreadyDecidedError)

    const [span] = tracing.exporter.getFinishedSpans()
    expect(span.attributes['expense.outcome']).toBe('AlreadyDecidedError')
    expect(span.status.code).toBe(SpanStatusCode.UNSET)
  })

  it('une panne marque le span en erreur et enregistre l’exception', async () => {
    const useCase = instrumentUseCase('ListMyExpenseNotes', {
      execute: async () => {
        throw new Error('connexion perdue')
      },
    })

    await expect(useCase.execute(undefined)).rejects.toThrow('connexion perdue')

    const [span] = tracing.exporter.getFinishedSpans()
    expect(span.status.code).toBe(SpanStatusCode.ERROR)
    expect(span.events.map((event) => event.name)).toContain('exception')
  })
})

describe('OpenTelemetryMessageObserver', () => {
  function claimedWithinRequest(): { claimed: ClaimedMessage; traceId: string } {
    const event = expenseNoteDecided(anExpenseNote({ userId: 'employee' }).approve('manager', T0), 'evt-1')
    return trace.getTracer('test').startActiveSpan('POST /api/expense-notes/{id}/decision', (span) => {
      const carrier: Record<string, string> = {}
      propagation.inject(context.active(), carrier)
      span.end()
      return {
        claimed: { message: event, attempts: 1, correlationId: 'corr-1234-abcd', traceparent: carrier.traceparent },
        traceId: span.spanContext().traceId,
      }
    })
  }

  it('traite le message dans la trace de la requête d’origine, avec son id de corrélation', async () => {
    const { claimed, traceId } = claimedWithinRequest()
    let correlationDuringProcessing: string | undefined

    const outcome = await new OpenTelemetryMessageObserver().observe(claimed, async () => {
      correlationDuringProcessing = currentCorrelationId()
      return 'processed'
    })

    expect(outcome).toBe('processed')
    expect(correlationDuringProcessing).toBe('corr-1234-abcd')
    const consumer = tracing.exporter.getFinishedSpans().find((span) => span.name === 'outbox process ExpenseNoteDecided')
    expect(consumer?.kind).toBe(SpanKind.CONSUMER)
    expect(consumer?.spanContext().traceId).toBe(traceId)
    expect(consumer?.attributes).toMatchObject({ 'messaging.message.id': 'evt-1', 'outbox.outcome': 'processed' })
  })

  it('un message mis en retry ou en lettre morte marque le span en erreur', async () => {
    const { claimed } = claimedWithinRequest()
    await new OpenTelemetryMessageObserver().observe(claimed, async () => 'dead-letter')
    const consumer = tracing.exporter.getFinishedSpans().find((span) => span.name.startsWith('outbox process'))
    expect(consumer?.status.code).toBe(SpanStatusCode.ERROR)
  })

  it('sans contexte enregistré (message antérieur), ouvre une nouvelle trace', async () => {
    const { claimed } = claimedWithinRequest()
    await new OpenTelemetryMessageObserver().observe({ ...claimed, traceparent: null, correlationId: null }, async () => 'processed')
    expect(tracing.exporter.getFinishedSpans().some((span) => span.name.startsWith('outbox process'))).toBe(true)
  })

  it('une exception du traitement est enregistrée puis propagée', async () => {
    const { claimed } = claimedWithinRequest()
    await expect(
      new OpenTelemetryMessageObserver().observe(claimed, async () => {
        throw new Error('store indisponible')
      })
    ).rejects.toThrow('store indisponible')
    const consumer = tracing.exporter.getFinishedSpans().find((span) => span.name.startsWith('outbox process'))
    expect(consumer?.status.code).toBe(SpanStatusCode.ERROR)
  })
})

describe('OutboxWorker + observateur', () => {
  it('passe chaque message à l’observateur, qui reçoit l’issue du traitement', async () => {
    const store = new InMemoryOutboxStore(() => T0)
    store.publish(expenseNoteDecided(anExpenseNote({ userId: 'employee' }).approve('manager', T0), 'evt-1'))
    const outcomes: string[] = []
    const observer: MessageObserver = {
      observe: async (_claimed, process) => {
        const outcome = await process()
        outcomes.push(outcome)
        return outcome
      },
    }
    const worker = new OutboxWorker(store, { ExpenseNoteDecided: { handle: async () => {} } }, undefined, undefined, () => T0, observer)

    await worker.drain()

    expect(outcomes).toEqual(['processed'])
  })
})
