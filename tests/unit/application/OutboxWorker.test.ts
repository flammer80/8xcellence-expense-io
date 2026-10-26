import { describe, expect, it, vi } from 'vitest'
import type { OutboxMessage } from '@/application/messages'
import { OutboxWorker, type OutboxWorkerOptions } from '@/application/OutboxWorker'
import { expenseNoteDecided, expenseNoteSubmitted } from '@/domain/events'
import { InMemoryOutboxStore } from '@/infrastructure/in-memory/InMemoryOutboxStore'
import { anExpenseNote } from '../../helpers/builders'

const T0 = new Date('2026-10-26T09:00:00.000Z')

const OPTIONS: OutboxWorkerOptions = {
  maxAttempts: 3,
  batchSize: 10,
  leaseSeconds: 60,
  retryDelayMs: () => 1000,
}

function decidedEvent(id = 'evt-1') {
  return expenseNoteDecided(anExpenseNote({ userId: 'employee' }).approve('manager', T0), id)
}

/** Horloge contrôlée par le test, partagée par la file et le worker. */
function setup(handle: (message: OutboxMessage) => Promise<void> = async () => {}) {
  let now = T0
  const clock = {
    now: () => now,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms)
    },
  }
  const store = new InMemoryOutboxStore(clock.now)
  const handler = { handle: vi.fn(handle), onDeadLetter: vi.fn(async () => {}) }
  const logs: Record<string, unknown>[] = []
  const worker = new OutboxWorker(store, { ExpenseNoteDecided: handler }, OPTIONS, (e) => logs.push(e), clock.now)
  return { store, handler, worker, clock, logs }
}

describe('OutboxWorker', () => {
  it('passe le message à son consommateur puis l’acquitte : il n’est plus redistribué', async () => {
    const { store, handler, worker } = setup()
    store.publish(decidedEvent())

    await worker.drain()
    await worker.drain()

    expect(handler.handle).toHaveBeenCalledTimes(1)
    expect(store.messages.get('evt-1')?.processedAt).toEqual(T0)
  })

  it('acquitte un événement sans consommateur (point d’extension)', async () => {
    const { store, worker } = setup()
    store.publish(expenseNoteSubmitted(anExpenseNote({ createdAt: T0.toISOString() }), 'evt-s'))

    await worker.drain()

    expect(store.messages.get('evt-s')?.processedAt).not.toBeNull()
  })

  it('redistribue un message en échec après le délai, puis l’acquitte quand il passe', async () => {
    let calls = 0
    const { store, handler, worker, clock } = setup(async () => {
      if (++calls === 1) throw new Error('SMTP indisponible')
    })
    store.publish(decidedEvent())

    await worker.drain()
    expect(store.messages.get('evt-1')).toMatchObject({ processedAt: null, lastError: 'SMTP indisponible' })

    await worker.drain()
    expect(handler.handle).toHaveBeenCalledTimes(1)

    clock.advance(1000)
    await worker.drain()
    expect(handler.handle).toHaveBeenCalledTimes(2)
    expect(store.messages.get('evt-1')?.processedAt).not.toBeNull()
  })

  it('met le message en lettre morte après N échecs et prévient le consommateur une fois', async () => {
    const { store, handler, worker, clock, logs } = setup(async () => {
      throw new Error('image illisible')
    })
    store.publish(decidedEvent())

    for (let i = 0; i < 5; i++) {
      await worker.drain()
      clock.advance(1000)
    }

    expect(handler.handle).toHaveBeenCalledTimes(OPTIONS.maxAttempts)
    expect(handler.onDeadLetter).toHaveBeenCalledTimes(1)
    expect(store.messages.get('evt-1')).toMatchObject({ processedAt: null, lastError: 'image illisible' })
    expect(store.messages.get('evt-1')?.deadAt).not.toBeNull()
    expect(logs.some((l) => l.event === 'dead-letter')).toBe(true)
  })

  it('met directement en lettre morte une version de contrat inconnue', async () => {
    const { store, handler, worker } = setup()
    store.publish({ ...decidedEvent(), version: 2 })

    await worker.drain()

    expect(handler.handle).not.toHaveBeenCalled()
    expect(store.messages.get('evt-1')?.deadAt).not.toBeNull()
  })

  it('redistribue un message réclamé mais jamais acquitté, à l’expiration du bail (worker planté)', async () => {
    const { store, handler, worker, clock } = setup()
    store.publish(decidedEvent())

    await store.claim(10, OPTIONS.leaseSeconds) // un worker le prend puis plante
    await worker.drain()
    expect(handler.handle).not.toHaveBeenCalled()

    clock.advance(OPTIONS.leaseSeconds * 1000 + 1)
    await worker.drain()
    expect(handler.handle).toHaveBeenCalledTimes(1)
  })
})
