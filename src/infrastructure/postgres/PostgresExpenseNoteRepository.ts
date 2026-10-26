import type { ExpenseNoteRepository } from '@/application/ports/ExpenseNoteRepository'
import { AlreadyDecidedError } from '@/domain/errors'
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

// Un identifiant qui n'est pas un UUID ne désigne aucune note : on répond
// « introuvable » plutôt que de laisser Postgres lever une erreur de syntaxe.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  async add(note: ExpenseNote, actorId: string): Promise<ExpenseNote> {
    return withUserScope(actorId, async (client) => {
      const result = await client.query<ExpenseNoteRow>(
        `INSERT INTO expense_notes
           (id, user_id, company_id, amount, expense_date, description, receipt_key, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          note.id,
          note.userId,
          note.companyId,
          note.amount.toDecimal(),
          note.expenseDate.toString(),
          note.description,
          note.receiptKey,
          note.status,
          note.createdAt,
        ]
      )
      return toExpenseNote(result.rows[0])
    })
  }

  async findById(noteId: string, actorId: string): Promise<ExpenseNote | null> {
    if (!UUID.test(noteId)) return null
    return withUserScope(actorId, async (client) => {
      const result = await client.query<ExpenseNoteRow>('SELECT * FROM expense_notes WHERE id = $1', [noteId])
      return result.rows[0] ? toExpenseNote(result.rows[0]) : null
    })
  }

  async listPendingByAuthors(authorIds: string[], actorId: string): Promise<ExpenseNote[]> {
    return withUserScope(actorId, async (client) => {
      const result = await client.query<ExpenseNoteRow>(
        `SELECT * FROM expense_notes
         WHERE user_id = ANY($1::uuid[]) AND status = 'pending'
         ORDER BY created_at ASC`,
        [authorIds]
      )
      return result.rows.map(toExpenseNote)
    })
  }

  async saveDecision(note: ExpenseNote, actorId: string): Promise<ExpenseNote> {
    return withUserScope(actorId, async (client) => {
      // Mise à jour conditionnelle : si une autre décision est passée entre la
      // lecture et l'écriture, aucune ligne ne correspond et on refuse (409).
      const result = await client.query<ExpenseNoteRow>(
        `UPDATE expense_notes
         SET status = $2, decided_by = $3, decided_at = $4, rejection_reason = $5
         WHERE id = $1 AND status = 'pending'
         RETURNING *`,
        [note.id, note.status, note.decidedBy, note.decidedAt, note.rejectionReason]
      )
      if (!result.rows[0]) throw new AlreadyDecidedError(note.id)
      return toExpenseNote(result.rows[0])
    })
  }
}
