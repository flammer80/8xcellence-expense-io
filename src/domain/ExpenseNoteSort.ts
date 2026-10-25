/** Champs selon lesquels une liste de notes peut être triée. */
export const EXPENSE_NOTE_SORT_FIELDS = ['createdAt', 'expenseDate', 'amount', 'status'] as const

export type ExpenseNoteSortField = (typeof EXPENSE_NOTE_SORT_FIELDS)[number]

/**
 * Ordre de tri d'une liste de notes, exprimé dans le vocabulaire du domaine.
 * Chaque adaptateur le traduit (colonne SQL, comparateur en mémoire) : aucun
 * fragment de SQL ne traverse les couches (SEC-01).
 */
export interface ExpenseNoteSort {
  field: ExpenseNoteSortField
  direction: 'asc' | 'desc'
}

/** Les notes les plus récentes d'abord : l'ordre historique de `GET /api/expense-notes`. */
export const DEFAULT_EXPENSE_NOTE_SORT: ExpenseNoteSort = { field: 'createdAt', direction: 'desc' }
