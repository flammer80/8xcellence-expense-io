import { describe, expect, it } from 'vitest'
import { AlreadyDecidedError, InvalidInputError } from '@/domain/errors'
import { MAX_REJECTION_REASON_LENGTH } from '@/domain/ExpenseNote'
import { anExpenseNote } from '../../helpers/builders'

// Règle métier n°5 : une note ne se tranche qu'une fois.

const AT = new Date('2026-10-26T09:00:00.000Z')

describe('ExpenseNote', () => {
  it('passe de pending à approved, enregistre qui et quand, sans modifier la note d’origine', () => {
    const note = anExpenseNote()

    const approved = note.approve('manager-1', AT)

    expect(approved.status).toBe('approved')
    expect(approved.decidedBy).toBe('manager-1')
    expect(approved.decidedAt).toEqual(AT)
    expect(approved.rejectionReason).toBeNull()
    expect(note.status).toBe('pending')
    expect(note.decidedBy).toBeNull()
  })

  it('passe de pending à rejected avec un motif facultatif', () => {
    expect(anExpenseNote().reject('manager-1', AT).rejectionReason).toBeNull()
    expect(anExpenseNote().reject('manager-1', AT, '  Reçu illisible ').rejectionReason).toBe('Reçu illisible')
    expect(anExpenseNote().reject('manager-1', AT, '   ').rejectionReason).toBeNull()
  })

  it('refuse un motif trop long', () => {
    const reason = 'x'.repeat(MAX_REJECTION_REASON_LENGTH + 1)
    expect(() => anExpenseNote().reject('manager-1', AT, reason)).toThrow(InvalidInputError)
  })

  it.each(['approved', 'rejected'] as const)('refuse de trancher une note déjà %s', (status) => {
    const note = anExpenseNote({ status })

    expect(note.canBeDecided()).toBe(false)
    expect(() => note.approve('manager-1', AT)).toThrow(AlreadyDecidedError)
    expect(() => note.reject('manager-1', AT)).toThrow(AlreadyDecidedError)
  })
})
