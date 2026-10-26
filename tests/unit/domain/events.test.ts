import { describe, expect, it } from 'vitest'
import { expenseNoteDecided, expenseNoteSubmitted } from '@/domain/events'
import { anExpenseNote } from '../../helpers/builders'

const DECIDED_AT = new Date('2026-10-26T09:00:00.000Z')

describe('événements de domaine (contrat v1)', () => {
  it('ExpenseNoteSubmitted porte la note soumise et son entreprise', () => {
    const note = anExpenseNote({ id: 'n1', userId: 'employee', companyId: 'acme', amount: 42.5 })

    const event = expenseNoteSubmitted(note, 'evt-1')

    expect(event).toMatchObject({
      id: 'evt-1',
      type: 'ExpenseNoteSubmitted',
      version: 1,
      companyId: 'acme',
      occurredAt: note.createdAt,
      payload: { noteId: 'n1', authorId: 'employee', amount: 42.5, currency: 'EUR', expenseDate: '2026-10-01' },
    })
  })

  it('ExpenseNoteDecided porte la décision, son auteur et le motif', () => {
    const note = anExpenseNote({ id: 'n1', userId: 'employee' }).reject('manager', DECIDED_AT, 'Reçu illisible')

    const event = expenseNoteDecided(note, 'evt-2')

    expect(event).toMatchObject({
      type: 'ExpenseNoteDecided',
      version: 1,
      occurredAt: DECIDED_AT,
      payload: {
        noteId: 'n1',
        authorId: 'employee',
        decision: 'rejected',
        decidedBy: 'manager',
        rejectionReason: 'Reçu illisible',
      },
    })
  })

  it("refuse d'émettre une décision pour une note encore en attente", () => {
    expect(() => expenseNoteDecided(anExpenseNote(), 'evt')).toThrow(/pas tranchée/)
  })
})
