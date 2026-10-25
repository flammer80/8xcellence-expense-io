import { ListMyExpenseNotes } from '@/application/ListMyExpenseNotes'
import { PostgresExpenseNoteRepository } from '@/infrastructure/postgres/PostgresExpenseNoteRepository'

// Racine de composition : le seul fichier qui choisit quelle implémentation
// sert chaque port. Les routes importent les cas d'usage d'ici ; les tests
// unitaires les construisent eux-mêmes avec des adaptateurs en mémoire.

const expenseNoteRepository = new PostgresExpenseNoteRepository()

export const listMyExpenseNotes = new ListMyExpenseNotes(expenseNoteRepository)
