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
import { instrumentUseCase } from '@/infrastructure/observability/instrumentUseCase'
import { OpenTelemetryMessageObserver } from '@/infrastructure/observability/OpenTelemetryMessageObserver'
import { S3ReceiptStorage } from '@/infrastructure/s3/S3ReceiptStorage'
import { logger, logSecurityEvent } from '@/lib/logger'
import { appMetrics } from '@/lib/telemetry'

// Racine de composition : le seul fichier qui choisit quelle implémentation
// sert chaque port. Les routes importent les cas d'usage d'ici ; les tests
// unitaires les construisent eux-mêmes avec des adaptateurs en mémoire.
// Chaque cas d'usage est enveloppé dans un span (`instrumentUseCase`) ; les
// métriques métier sont posées ici, sur le succès du cas d'usage (ADR 0011).

const expenseNoteRepository = new PostgresExpenseNoteRepository()
const userRepository = new PostgresUserRepository()
const receiptStorage = new S3ReceiptStorage()
const notifications = new PostgresNotificationAdapter()
const receiptSuggestionRepository = new PostgresReceiptSuggestionRepository()

export const submitExpenseNote = instrumentUseCase(
  'SubmitExpenseNote',
  new SubmitExpenseNote(expenseNoteRepository, userRepository, receiptStorage),
  { onSuccess: () => appMetrics().notesSubmitted.add(1) }
)
export const listMyExpenseNotes = instrumentUseCase('ListMyExpenseNotes', new ListMyExpenseNotes(expenseNoteRepository))
export const listPendingApprovals = instrumentUseCase(
  'ListPendingApprovals',
  new ListPendingApprovals(expenseNoteRepository, userRepository)
)
export const decideExpenseNote = instrumentUseCase(
  'DecideExpenseNote',
  new DecideExpenseNote(expenseNoteRepository, userRepository),
  {
    onSuccess: (note) => {
      appMetrics().notesDecided.add(1, { decision: note.status })
      if (note.decidedAt) {
        appMetrics().decisionDelay.record((note.decidedAt.getTime() - note.createdAt.getTime()) / 1000, {
          decision: note.status,
        })
      }
    },
  }
)
export const getReceiptUrl = instrumentUseCase(
  'GetReceiptUrl',
  new GetReceiptUrl(expenseNoteRepository, userRepository, receiptStorage)
)
export const listCompanyUsers = instrumentUseCase('ListCompanyUsers', new ListCompanyUsers(userRepository))
export const assignManager = instrumentUseCase('AssignManager', new AssignManager(userRepository), {
  onSuccess: (user, { actorId, userId, managerId }) => {
    appMetrics().managerAssignments.add(1, { action: managerId ? 'assign' : 'detach' })
    logSecurityEvent('manager-assigned', { actorId, userId, managerId, companyId: user.companyId }, 'info')
  },
})
export const listMyNotifications = instrumentUseCase('ListMyNotifications', new ListMyNotifications(notifications))
export const requestReceiptSuggestion = instrumentUseCase(
  'RequestReceiptSuggestion',
  new RequestReceiptSuggestion(receiptSuggestionRepository, userRepository, receiptStorage)
)
export const getReceiptSuggestion = instrumentUseCase(
  'GetReceiptSuggestion',
  new GetReceiptSuggestion(receiptSuggestionRepository)
)

/**
 * Worker unique de l'asynchrone (ADR 0007). Chorégraphie : chaque type de
 * message a son consommateur ; `ExpenseNoteSubmitted` n'en a pas encore.
 */
export const outboxWorker = new OutboxWorker(
  new PostgresOutboxStore(),
  {
    ExpenseNoteDecided: new NotifyAuthorOfDecision(notifications),
    ReceiptOcrRequested: new ProcessReceiptOcr(receiptSuggestionRepository, receiptStorage, new TesseractOcrService()),
    EmailVerificationRequested: new SendVerificationEmail(new ConsoleEmailSender(), appUrl()),
  },
  undefined,
  (entry) => {
    const { level, event, ...fields } = entry
    const method = level === 'error' || level === 'warn' ? level : 'info'
    logger[method]({ component: 'outbox-worker', event, ...fields }, String(event))
  },
  undefined,
  new OpenTelemetryMessageObserver()
)

/** URL publique de l'application, pour les liens envoyés par email. */
function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
}
