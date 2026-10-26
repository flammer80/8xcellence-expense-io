import { DecideExpenseNote } from '@/application/DecideExpenseNote'
import { GetReceiptUrl } from '@/application/GetReceiptUrl'
import { ListMyExpenseNotes } from '@/application/ListMyExpenseNotes'
import { ListPendingApprovals } from '@/application/ListPendingApprovals'
import { SubmitExpenseNote } from '@/application/SubmitExpenseNote'
import { PostgresExpenseNoteRepository } from '@/infrastructure/postgres/PostgresExpenseNoteRepository'
import { PostgresUserRepository } from '@/infrastructure/postgres/PostgresUserRepository'
import { S3ReceiptStorage } from '@/infrastructure/s3/S3ReceiptStorage'

// Racine de composition : le seul fichier qui choisit quelle implémentation
// sert chaque port. Les routes importent les cas d'usage d'ici ; les tests
// unitaires les construisent eux-mêmes avec des adaptateurs en mémoire.

const expenseNoteRepository = new PostgresExpenseNoteRepository()
const userRepository = new PostgresUserRepository()
const receiptStorage = new S3ReceiptStorage()

export const submitExpenseNote = new SubmitExpenseNote(expenseNoteRepository, userRepository, receiptStorage)
export const listMyExpenseNotes = new ListMyExpenseNotes(expenseNoteRepository)
export const listPendingApprovals = new ListPendingApprovals(expenseNoteRepository, userRepository)
export const decideExpenseNote = new DecideExpenseNote(expenseNoteRepository, userRepository)
export const getReceiptUrl = new GetReceiptUrl(expenseNoteRepository, userRepository, receiptStorage)
