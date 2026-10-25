import type { ExpenseNoteRepository } from '@/application/ports/ExpenseNoteRepository'
import type { ExpenseNote } from '@/domain/ExpenseNote'
import type { ExpenseNoteSort, ExpenseNoteSortField } from '@/domain/ExpenseNoteSort'
import { withUserScope } from '@/lib/db'
import { toExpenseNote, type ExpenseNoteRow } from './expenseNoteRow'

// ORDER BY n'accepte pas de paramètre lié : la clause est construite à partir
// de cette table de correspondance, jamais d'une saisie (SEC-01).
const COLUMN_BY_SORT_FIELD: Record<ExpenseNoteSortField, string> = {
  createdAt: 'created_at',
  expenseDate: 'expense_date',
  amount: 'amount',
  status: 'status',
}

function toOrderBy({ field, direction }: ExpenseNoteSort): string {
  return `${COLUMN_BY_SORT_FIELD[field]} ${direction === 'desc' ? 'DESC' : 'ASC'}`
}

/**
 * Notes de frais stockées dans Postgres. Chaque requête passe par
 * `withUserScope`, qui expose l'utilisateur courant aux policies RLS.
 */
export class PostgresExpenseNoteRepository implements ExpenseNoteRepository {
  async listByOwner(ownerId: string, sort: ExpenseNoteSort): Promise<ExpenseNote[]> {
    return withUserScope(ownerId, async (client) => {
      const result = await client.query<ExpenseNoteRow>(
        `SELECT * FROM expense_notes WHERE user_id = $1 ORDER BY ${toOrderBy(sort)}`,
        [ownerId]
      )
      return result.rows.map(toExpenseNote)
    })
  }
}
