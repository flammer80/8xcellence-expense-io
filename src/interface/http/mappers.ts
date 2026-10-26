import type { PendingApproval } from '@/application/ListPendingApprovals'
import type { Notification } from '@/application/ports/NotificationPort'
import type { ExpenseNote } from '@/domain/ExpenseNote'
import type { ReceiptSuggestion } from '@/domain/ReceiptSuggestion'
import type { User } from '@/domain/User'
import type {
  CompanyUserDto,
  ExpenseNoteDto,
  NotificationDto,
  PendingApprovalDto,
  ReceiptSuggestionDto,
} from './dto'

// Seule traduction des objets du domaine vers les DTO de l'API (`dto.ts`).

export function toExpenseNoteDto(note: ExpenseNote): ExpenseNoteDto {
  return {
    id: note.id,
    userId: note.userId,
    amount: note.amount.toDecimal(),
    expenseDate: note.expenseDate.toString(),
    description: note.description,
    status: note.status,
    createdAt: note.createdAt.toISOString(),
  }
}

export function toPendingApprovalDto({ note, author }: PendingApproval): PendingApprovalDto {
  return { ...toExpenseNoteDto(note), authorName: author.name }
}

/** @throws Error pour un RH : il ne figure pas dans l'annuaire des rattachements. */
export function toCompanyUserDto(user: User): CompanyUserDto {
  if (user.role === 'hr_admin') throw new Error(`Un RH n'est pas un membre rattachable : ${user.id}`)
  return { id: user.id, name: user.name, email: user.email, role: user.role, managerId: user.managerId }
}

export function toNotificationDto(notification: Notification): NotificationDto {
  return {
    id: notification.id,
    noteId: notification.noteId,
    noteDescription: notification.noteDescription,
    decision: notification.decision,
    rejectionReason: notification.rejectionReason,
    createdAt: notification.createdAt.toISOString(),
  }
}

export function toReceiptSuggestionDto(suggestion: ReceiptSuggestion): ReceiptSuggestionDto {
  return {
    id: suggestion.id,
    status: suggestion.status,
    ...suggestion.fields,
    createdAt: suggestion.createdAt.toISOString(),
    completedAt: suggestion.completedAt?.toISOString() ?? null,
  }
}

export const receiptSuggestionPath = (id: string) => `/api/receipt-suggestions/${id}`
