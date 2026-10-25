import { describe, expect, it } from 'vitest'
import { AlreadyDecidedError } from '@/domain/errors'
import { anExpenseNote } from '../../helpers/builders'

// Règle métier n°5 : une note ne se tranche qu'une fois.

describe('ExpenseNote', () => {
  it('passe de pending à approved sans modifier la note d’origine', () => {
    const note = anExpenseNote()

    const approved = note.approve()

    expect(approved.status).toBe('approved')
    expect(note.status).toBe('pending')
  })

  it('passe de pending à rejected', () => {
    expect(anExpenseNote().reject().status).toBe('rejected')
  })

  it.each(['approved', 'rejected'] as const)('refuse de trancher une note déjà %s', (status) => {
    const note = anExpenseNote({ status })

    expect(note.canBeDecided()).toBe(false)
    expect(() => note.approve()).toThrow(AlreadyDecidedError)
    expect(() => note.reject()).toThrow(AlreadyDecidedError)
  })
})
