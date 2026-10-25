import type { ExpenseNote } from '@/domain/ExpenseNote'
import type { ExpenseNoteSort } from '@/domain/ExpenseNoteSort'

/**
 * Accès en lecture et écriture aux notes de frais.
 *
 * Implémentations : `PostgresExpenseNoteRepository` (production, seul
 * endroit où vit le SQL des notes) et `InMemoryExpenseNoteRepository` (tests).
 * Le port s'enrichit au fil des cas d'usage migrés (décision à l'étape 3,
 * soumission à l'étape 4).
 */
export interface ExpenseNoteRepository {
  /**
   * Notes dont `ownerId` est l'auteur, dans l'ordre demandé.
   * Liste vide si l'utilisateur n'a aucune note ou n'existe pas.
   */
  listByOwner(ownerId: string, sort: ExpenseNoteSort): Promise<ExpenseNote[]>
}
