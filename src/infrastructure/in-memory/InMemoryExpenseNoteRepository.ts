import type { ExpenseNoteRepository } from '@/application/ports/ExpenseNoteRepository'
import type { ExpenseNote } from '@/domain/ExpenseNote'
import type { ExpenseNoteSort, ExpenseNoteSortField } from '@/domain/ExpenseNoteSort'

type Comparator = (a: ExpenseNote, b: ExpenseNote) => number

const COMPARATOR_BY_SORT_FIELD: Record<ExpenseNoteSortField, Comparator> = {
  createdAt: (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  expenseDate: (a, b) => a.expenseDate.compareTo(b.expenseDate),
  amount: (a, b) => a.amount.compareTo(b.amount),
  status: (a, b) => a.status.localeCompare(b.status),
}

/** Adaptateur de test : mêmes garanties que le repository Postgres, sans base. */
export class InMemoryExpenseNoteRepository implements ExpenseNoteRepository {
  private readonly notes = new Map<string, ExpenseNote>()

  constructor(initialNotes: ExpenseNote[] = []) {
    initialNotes.forEach((note) => this.notes.set(note.id, note))
  }

  async listByOwner(ownerId: string, { field, direction }: ExpenseNoteSort): Promise<ExpenseNote[]> {
    const compare = COMPARATOR_BY_SORT_FIELD[field]
    const sign = direction === 'desc' ? -1 : 1
    return [...this.notes.values()]
      .filter((note) => note.userId === ownerId)
      .sort((a, b) => sign * compare(a, b))
  }
}
