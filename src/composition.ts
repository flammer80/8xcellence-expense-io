import { AssignManager } from '@/application/AssignManager'
import { DecideExpenseNote } from '@/application/DecideExpenseNote'
import { GetReceiptSuggestion } from '@/application/GetReceiptSuggestion'
import { GetReceiptUrl } from '@/application/GetReceiptUrl'
import { NotifyAuthorOfDecision } from '@/application/handlers/NotifyAuthorOfDecision'
import { ProcessReceiptOcr } from '@/application/handlers/ProcessReceiptOcr'
import { SendVerificationEmail } from '@/application/handlers/SendVerificationEmail'
import { ListCompanyUsers } from '@/application/ListCompanyUsers'
import { ListMyNotifications } from '@/application/ListMyNotifications'
import { ListMyExpenseNotes } from '@/application/ListMyExpenseNotes'
import { ListPendingApprovals } from '@/application/ListPendingApprovals'
import { OutboxWorker } from '@/application/OutboxWorker'
import { RequestReceiptSuggestion } from '@/application/RequestReceiptSuggestion'
import { SubmitExpenseNote } from '@/application/SubmitExpenseNote'
import { ConsoleEmailSender } from '@/infrastructure/notifications/ConsoleEmailSender'
import { TesseractOcrService } from '@/infrastructure/ocr/TesseractOcrService'
import { PostgresExpenseNoteRepository } from '@/infrastructure/postgres/PostgresExpenseNoteRepository'
import { PostgresNotificationAdapter } from '@/infrastructure/postgres/PostgresNotificationAdapter'
import { PostgresOutboxStore } from '@/infrastructure/postgres/PostgresOutboxStore'
import { PostgresReceiptSuggestionRepository } from '@/infrastructure/postgres/PostgresReceiptSuggestionRepository'
import { PostgresUserRepository } from '@/infrastructure/postgres/PostgresUserRepository'
import { S3ReceiptStorage } from '@/infrastructure/s3/S3ReceiptStorage'

// Racine de composition : le seul fichier qui choisit quelle implémentation
// sert chaque port. Les routes importent les cas d'usage d'ici ; les tests
// unitaires les construisent eux-mêmes avec des adaptateurs en mémoire.

const expenseNoteRepository = new PostgresExpenseNoteRepository()
const userRepository = new PostgresUserRepository()
const receiptStorage = new S3ReceiptStorage()
const notifications = new PostgresNotificationAdapter()
const receiptSuggestionRepository = new PostgresReceiptSuggestionRepository()

export const submitExpenseNote = new SubmitExpenseNote(expenseNoteRepository, userRepository, receiptStorage)
export const listMyExpenseNotes = new ListMyExpenseNotes(expenseNoteRepository)
export const listPendingApprovals = new ListPendingApprovals(expenseNoteRepository, userRepository)
export const decideExpenseNote = new DecideExpenseNote(expenseNoteRepository, userRepository)
export const getReceiptUrl = new GetReceiptUrl(expenseNoteRepository, userRepository, receiptStorage)
export const listCompanyUsers = new ListCompanyUsers(userRepository)
export const assignManager = new AssignManager(userRepository)
export const listMyNotifications = new ListMyNotifications(notifications)
export const requestReceiptSuggestion = new RequestReceiptSuggestion(
  receiptSuggestionRepository,
  userRepository,
  receiptStorage
)
export const getReceiptSuggestion = new GetReceiptSuggestion(receiptSuggestionRepository)

/**
 * Worker unique de l'asynchrone (ADR 0007). Chorégraphie : chaque type de
 * message a son consommateur ; `ExpenseNoteSubmitted` n'en a pas encore.
 */
export const outboxWorker = new OutboxWorker(new PostgresOutboxStore(), {
  ExpenseNoteDecided: new NotifyAuthorOfDecision(notifications),
  ReceiptOcrRequested: new ProcessReceiptOcr(receiptSuggestionRepository, receiptStorage, new TesseractOcrService()),
  EmailVerificationRequested: new SendVerificationEmail(new ConsoleEmailSender(), appUrl()),
})

/** URL publique de l'application, pour les liens envoyés par email. */
function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}
