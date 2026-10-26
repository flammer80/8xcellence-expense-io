import { describe, expect, it } from 'vitest'
import { DecideExpenseNote } from '@/application/DecideExpenseNote'
import { NotifyAuthorOfDecision } from '@/application/handlers/NotifyAuthorOfDecision'
import { ListMyNotifications } from '@/application/ListMyNotifications'
import { OutboxWorker } from '@/application/OutboxWorker'
import { AlreadyDecidedError } from '@/domain/errors'
import { InMemoryExpenseNoteRepository } from '@/infrastructure/in-memory/InMemoryExpenseNoteRepository'
import { InMemoryNotificationAdapter } from '@/infrastructure/in-memory/InMemoryNotificationAdapter'
import { InMemoryOutboxStore } from '@/infrastructure/in-memory/InMemoryOutboxStore'
import { InMemoryUserRepository } from '@/infrastructure/in-memory/InMemoryUserRepository'
import { aUser, anExpenseNote } from '../../helpers/builders'

const NOW = new Date('2026-10-26T09:00:00.000Z')

function setup() {
  const users = new InMemoryUserRepository([
    aUser('manager', { role: 'manager' }),
    aUser('employee', { managerId: 'manager' }),
  ])
  const notes = new InMemoryExpenseNoteRepository([anExpenseNote({ id: 'n1', userId: 'employee' })])
  let ids = 0
  const decide = new DecideExpenseNote(notes, users, () => NOW, () => `evt-${++ids}`)
  const notifications = new InMemoryNotificationAdapter(() => NOW)
  const outbox = new InMemoryOutboxStore(() => NOW)
  const worker = new OutboxWorker(
    outbox,
    { ExpenseNoteDecided: new NotifyAuthorOfDecision(notifications) },
    undefined,
    () => {},
    () => NOW
  )
  const inbox = (userId: string) => new ListMyNotifications(notifications).execute({ actorId: userId })
  /** Simule le relais : ce que le repository a enregistré part dans l'outbox. */
  const relay = () => outbox.publish(...notes.events.splice(0))
  return { decide, notes, outbox, worker, inbox, relay }
}

describe('Décision → événement → notification de l’auteur', () => {
  it('une décision émet ExpenseNoteDecided, enregistré avec elle', async () => {
    const { decide, notes } = setup()

    await decide.execute({ noteId: 'n1', actorId: 'manager', decision: 'rejected', reason: 'Hors politique' })

    expect(notes.events).toEqual([
      expect.objectContaining({
        id: 'evt-1',
        type: 'ExpenseNoteDecided',
        payload: expect.objectContaining({ authorId: 'employee', decision: 'rejected', rejectionReason: 'Hors politique' }),
      }),
    ])
  })

  it('une décision refusée (déjà tranchée) n’émet rien', async () => {
    const { decide, notes } = setup()
    await decide.execute({ noteId: 'n1', actorId: 'manager', decision: 'approved' })

    await expect(decide.execute({ noteId: 'n1', actorId: 'manager', decision: 'rejected' })).rejects.toThrow(
      AlreadyDecidedError
    )
    expect(notes.events).toHaveLength(1)
  })

  it('le worker prévient l’auteur, et lui seul', async () => {
    const { decide, worker, inbox, relay } = setup()
    await decide.execute({ noteId: 'n1', actorId: 'manager', decision: 'approved' })
    relay()

    await worker.drain()

    expect(await inbox('employee')).toEqual([
      expect.objectContaining({ noteId: 'n1', decision: 'approved', rejectionReason: null }),
    ])
    expect(await inbox('manager')).toEqual([])
  })

  it('un événement rejoué ne crée pas de seconde notification (consommateur idempotent)', async () => {
    const { decide, notes, outbox, worker, inbox } = setup()
    await decide.execute({ noteId: 'n1', actorId: 'manager', decision: 'approved' })
    const [event] = notes.events

    outbox.publish(event)
    await worker.drain()
    // Même événement livré une seconde fois (worker planté avant l'ack).
    outbox.publish(event)
    await worker.drain()

    expect(await inbox('employee')).toHaveLength(1)
  })
})
