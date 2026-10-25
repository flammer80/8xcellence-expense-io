import { describe, expect, it } from 'vitest'
import { ListMyExpenseNotes } from '@/application/ListMyExpenseNotes'
import { InMemoryExpenseNoteRepository } from '@/infrastructure/in-memory/InMemoryExpenseNoteRepository'
import { anExpenseNote } from '../../helpers/builders'

function setup() {
  const notes = [
    anExpenseNote({ id: 'old', userId: 'alice', amount: 30, createdAt: '2026-10-01T08:00:00Z', expenseDate: '2026-09-15' }),
    anExpenseNote({ id: 'new', userId: 'alice', amount: 5, createdAt: '2026-10-03T08:00:00Z', expenseDate: '2026-09-01', status: 'approved' }),
    anExpenseNote({ id: 'mid', userId: 'alice', amount: 12, createdAt: '2026-10-02T08:00:00Z', expenseDate: '2026-09-30', status: 'rejected' }),
    anExpenseNote({ id: 'bob', userId: 'bob', amount: 99, createdAt: '2026-10-04T08:00:00Z' }),
  ]
  return new ListMyExpenseNotes(new InMemoryExpenseNoteRepository(notes))
}

const ids = (notes: { id: string }[]) => notes.map((note) => note.id)

describe('ListMyExpenseNotes', () => {
  it("ne renvoie que les notes de l'utilisateur connecté", async () => {
    const notes = await setup().execute({ actorId: 'alice' })

    expect(notes.every((note) => note.userId === 'alice')).toBe(true)
    expect(ids(notes)).not.toContain('bob')
  })

  it("renvoie une liste vide pour un utilisateur sans note", async () => {
    expect(await setup().execute({ actorId: 'carol' })).toEqual([])
  })

  it('trie par défaut des plus récentes aux plus anciennes', async () => {
    expect(ids(await setup().execute({ actorId: 'alice' }))).toEqual(['new', 'mid', 'old'])
  })

  it.each([
    [{ field: 'amount', direction: 'asc' }, ['new', 'mid', 'old']],
    [{ field: 'amount', direction: 'desc' }, ['old', 'mid', 'new']],
    [{ field: 'expenseDate', direction: 'asc' }, ['new', 'old', 'mid']],
    [{ field: 'createdAt', direction: 'asc' }, ['old', 'mid', 'new']],
    [{ field: 'status', direction: 'asc' }, ['new', 'old', 'mid']],
  ] as const)('applique le tri %j', async (sort, expected) => {
    expect(ids(await setup().execute({ actorId: 'alice', sort }))).toEqual(expected)
  })
})
