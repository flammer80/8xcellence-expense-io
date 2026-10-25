import type { ExpenseNoteSort, ExpenseNoteSortField } from '@/domain/ExpenseNoteSort'

// Le contrat historique de `?sort=` utilise des noms de colonnes SQL :
// `colonne`, `colonne ASC` ou `colonne DESC`, sans tenir compte de la casse.
// On le conserve, mais on le traduit ici en tri du domaine (SEC-01).
const SORT_FIELD_BY_PARAM: Record<string, ExpenseNoteSortField> = {
  created_at: 'createdAt',
  expense_date: 'expenseDate',
  amount: 'amount',
  status: 'status',
}

const SORT_PARAM = /^\s*([a-z_]+)(?:\s+(asc|desc))?\s*$/i

/**
 * Lit le paramètre `sort` d'une requête.
 * @returns `undefined` sans paramètre (tri par défaut), `null` si la valeur
 *   est invalide (la route répond 400), le tri sinon.
 */
export function parseExpenseNoteSortParam(param: string | null): ExpenseNoteSort | undefined | null {
  if (!param) return undefined
  const match = SORT_PARAM.exec(param)
  if (!match) return null
  const field = SORT_FIELD_BY_PARAM[match[1].toLowerCase()]
  if (!field) return null
  return { field, direction: match[2]?.toLowerCase() === 'desc' ? 'desc' : 'asc' }
}
