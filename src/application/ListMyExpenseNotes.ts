import type { ExpenseNote } from '@/domain/ExpenseNote'
import { DEFAULT_EXPENSE_NOTE_SORT, type ExpenseNoteSort } from '@/domain/ExpenseNoteSort'
import type { ExpenseNoteRepository } from './ports/ExpenseNoteRepository'

export interface ListMyExpenseNotesInput {
  /** Utilisateur connecté ; il ne voit que ses propres notes. */
  actorId: string
  /** Ordre de tri ; par défaut, les plus récentes d'abord. */
  sort?: ExpenseNoteSort
}

/**
 * Cas d'usage : un utilisateur consulte l'historique de ses notes de frais.
 *
 * Préconditions : `actorId` est un utilisateur authentifié (vérifié par
 * l'adaptateur HTTP). Tous les rôles y ont accès (règle métier n°1).
 * Erreurs : aucune erreur métier ; une liste vide si l'utilisateur n'a
 * aucune note.
 */
export class ListMyExpenseNotes {
  constructor(private readonly notes: ExpenseNoteRepository) {}

  execute({ actorId, sort = DEFAULT_EXPENSE_NOTE_SORT }: ListMyExpenseNotesInput): Promise<ExpenseNote[]> {
    return this.notes.listByOwner(actorId, sort)
  }
}
