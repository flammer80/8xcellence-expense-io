import type { ExpenseNote, ExpenseNoteStatus } from '@/domain/ExpenseNote'

/**
 * Note de frais telle que l'API la renvoie. Ce format est un contrat (tests
 * de caractérisation, UI) : le modifier est un changement d'API.
 */
export interface ExpenseNoteDto {
  id: string
  userId: string
  amount: number
  expenseDate: string
  description: string
  /** Détail de stockage exposé par l'API historique ; retrait prévu à l'étape 6 (ARC-07). */
  receiptKey: string
  status: ExpenseNoteStatus
  createdAt: string
}

/** Seule traduction d'une note du domaine vers sa représentation JSON. */
export function toExpenseNoteDto(note: ExpenseNote): ExpenseNoteDto {
  return {
    id: note.id,
    userId: note.userId,
    amount: note.amount.toDecimal(),
    expenseDate: note.expenseDate.toString(),
    description: note.description,
    receiptKey: note.receiptKey,
    status: note.status,
    createdAt: note.createdAt.toISOString(),
  }
}
