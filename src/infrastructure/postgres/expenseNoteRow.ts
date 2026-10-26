import { ExpenseDate } from '@/domain/ExpenseDate'
import { ExpenseNote, type ExpenseNoteStatus } from '@/domain/ExpenseNote'
import { Money } from '@/domain/Money'

/** Ligne de la table `expense_notes`, telle que `pg` la renvoie. */
export interface ExpenseNoteRow {
  id: string
  user_id: string
  company_id: string
  /** `numeric(10, 2)` : `pg` le renvoie en chaîne pour ne pas perdre de précision. */
  amount: string
  /** `date` : chaîne `YYYY-MM-DD` (voir le parseur de type dans `lib/db.ts`). */
  expense_date: string
  description: string
  receipt_key: string
  status: ExpenseNoteStatus
  created_at: Date
  decided_by: string | null
  decided_at: Date | null
  rejection_reason: string | null
}

/**
 * Seule traduction d'une ligne SQL en entité du domaine (ARC-03 : ce mapping
 * était recopié dans 7 routes).
 */
export function toExpenseNote(row: ExpenseNoteRow): ExpenseNote {
  return new ExpenseNote({
    id: row.id,
    userId: row.user_id,
    companyId: row.company_id,
    amount: Money.fromDecimal(row.amount),
    expenseDate: ExpenseDate.parse(row.expense_date),
    description: row.description,
    receiptKey: row.receipt_key,
    status: row.status,
    createdAt: new Date(row.created_at),
    decidedBy: row.decided_by ?? null,
    decidedAt: row.decided_at ? new Date(row.decided_at) : null,
    rejectionReason: row.rejection_reason ?? null,
  })
}
