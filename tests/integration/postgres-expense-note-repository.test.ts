import { describe, expect, it } from 'vitest'
import { PostgresExpenseNoteRepository } from '@/infrastructure/postgres/PostgresExpenseNoteRepository'
import { createCompany, createNote, createUser } from '../helpers/factories'

// Le repository doit traduire chaque tri du domaine en SQL et reconstruire des
// entités valides : mêmes attentes que l'adaptateur en mémoire.

describe('PostgresExpenseNoteRepository.listByOwner', () => {
  async function setup() {
    const company = await createCompany()
    const alice = await createUser(company, 'employee')
    const bob = await createUser(company, 'employee')
    const cheap = await createNote(alice.id, { amount: 5, createdAt: '2026-10-03T08:00:00Z' })
    const pricey = await createNote(alice.id, { amount: 30.5, createdAt: '2026-10-01T08:00:00Z' })
    await createNote(bob.id)
    return { repository: new PostgresExpenseNoteRepository(), alice, cheap, pricey }
  }

  it("ne renvoie que les notes de l'auteur, en entités du domaine", async () => {
    const { repository, alice, cheap, pricey } = await setup()

    const notes = await repository.listByOwner(alice.id, { field: 'createdAt', direction: 'desc' })

    expect(notes.map((note) => note.id)).toEqual([cheap.id, pricey.id])
    expect(notes[1].amount.toDecimal()).toBe(30.5)
    expect(notes[1].expenseDate.toString()).toBe('2026-10-01')
    expect(notes[1].createdAt.toISOString()).toBe('2026-10-01T08:00:00.000Z')
  })

  it('trie par montant croissant puis décroissant', async () => {
    const { repository, alice, cheap, pricey } = await setup()

    const asc = await repository.listByOwner(alice.id, { field: 'amount', direction: 'asc' })
    const desc = await repository.listByOwner(alice.id, { field: 'amount', direction: 'desc' })

    expect(asc.map((note) => note.id)).toEqual([cheap.id, pricey.id])
    expect(desc.map((note) => note.id)).toEqual([pricey.id, cheap.id])
  })
})
