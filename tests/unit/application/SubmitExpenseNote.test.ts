import { describe, expect, it } from 'vitest'
import { SubmitExpenseNote, type SubmitExpenseNoteInput } from '@/application/SubmitExpenseNote'
import { InvalidInputError, NotFoundError } from '@/domain/errors'
import type { ExpenseNote } from '@/domain/ExpenseNote'
import { InMemoryExpenseNoteRepository } from '@/infrastructure/in-memory/InMemoryExpenseNoteRepository'
import { InMemoryReceiptStorage } from '@/infrastructure/in-memory/InMemoryReceiptStorage'
import { InMemoryUserRepository } from '@/infrastructure/in-memory/InMemoryUserRepository'
import { aUser } from '../../helpers/builders'

const NOW = new Date('2026-10-26T09:00:00.000Z')
const NOTE_ID = '7d0c3f0e-9b8a-4c55-9d7e-2b1f6a3c4e5d'
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])

function input(overrides: Partial<SubmitExpenseNoteInput> = {}): SubmitExpenseNoteInput {
  return {
    actorId: 'employee',
    amount: 42.5,
    expenseDate: '2026-10-20',
    description: '  Taxi aéroport  ',
    receipt: { bytes: PNG, declaredType: 'image/png' },
    ...overrides,
  }
}

function setup(notes = new InMemoryExpenseNoteRepository()) {
  const users = new InMemoryUserRepository([aUser('employee', { companyId: 'acme', managerId: 'manager' })])
  const receipts = new InMemoryReceiptStorage()
  const submit = new SubmitExpenseNote(notes, users, receipts, () => NOW, () => NOTE_ID)
  return { notes, receipts, submit }
}

/** Repository dont l'insertion échoue, pour éprouver la compensation. */
class FailingInsertRepository extends InMemoryExpenseNoteRepository {
  async add(): Promise<ExpenseNote> {
    throw new Error('violation de contrainte')
  }
}

describe('SubmitExpenseNote', () => {
  it("crée une note en attente, dans l'entreprise de l'auteur, avec une clé dérivée de son UUID", async () => {
    const { notes, receipts, submit } = setup()

    const note = await submit.execute(input())

    expect(note.id).toBe(NOTE_ID)
    expect(note.companyId).toBe('acme')
    expect(note.status).toBe('pending')
    expect(note.description).toBe('Taxi aéroport')
    expect(note.createdAt).toEqual(NOW)
    expect(note.receiptKey).toBe(`receipts/acme/${NOTE_ID}.png`)
    expect(receipts.files.get(note.receiptKey)).toEqual({ body: PNG, contentType: 'image/png' })
    expect(await notes.findById(NOTE_ID)).toBe(note)
  })

  it("si l'insertion échoue, supprime le reçu déposé et propage l'erreur", async () => {
    const { receipts, submit } = setup(new FailingInsertRepository())

    await expect(submit.execute(input())).rejects.toThrow('violation de contrainte')
    expect(receipts.files.size).toBe(0)
  })

  it.each([
    ['montant nul', { amount: 0 }, 'amount'],
    ['montant non numérique', { amount: Number.NaN }, 'amount'],
    ['date inexistante', { expenseDate: '2026-02-30' }, 'expenseDate'],
    ['description vide', { description: '   ' }, 'description'],
    ['type non accepté', { receipt: { bytes: PNG, declaredType: 'image/gif' } }, 'receipt.type'],
    ['contenu PDF annoncé PNG', { receipt: { bytes: Buffer.from('%PDF-1.7'), declaredType: 'image/png' } }, 'receipt.type'],
  ])('refuse un %s, sans rien déposer ni écrire', async (_label, overrides, field) => {
    const { notes, receipts, submit } = setup()

    const error = await submit.execute(input(overrides)).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(InvalidInputError)
    expect((error as InvalidInputError).field).toBe(field)
    expect(receipts.files.size).toBe(0)
    expect(await notes.listByOwner('employee', { field: 'createdAt', direction: 'desc' })).toEqual([])
  })

  it("refuse un auteur inconnu (compte supprimé depuis l'émission du jeton)", async () => {
    const { receipts, submit } = setup()

    await expect(submit.execute(input({ actorId: 'ghost' }))).rejects.toBeInstanceOf(NotFoundError)
    expect(receipts.files.size).toBe(0)
  })
})
