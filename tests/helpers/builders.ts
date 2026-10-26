import { ExpenseDate } from '@/domain/ExpenseDate'
import { ExpenseNote, type ExpenseNoteStatus } from '@/domain/ExpenseNote'
import { Money } from '@/domain/Money'
import { User, type UserRole } from '@/domain/User'

let sequence = 0

/** Construit une note du domaine valide ; chaque champ peut être surchargé (tests unitaires). */
export function anExpenseNote(
  overrides: {
    id?: string
    userId?: string
    amount?: number
    expenseDate?: string
    status?: ExpenseNoteStatus
    createdAt?: string
  } = {}
): ExpenseNote {
  const n = ++sequence
  return new ExpenseNote({
    id: overrides.id ?? `note-${n}`,
    userId: overrides.userId ?? 'user-1',
    amount: Money.fromDecimal(overrides.amount ?? 10),
    expenseDate: ExpenseDate.parse(overrides.expenseDate ?? '2026-10-01'),
    description: `note ${n}`,
    receiptKey: `receipts/${n}.png`,
    status: overrides.status ?? 'pending',
    createdAt: new Date(overrides.createdAt ?? '2026-10-01T10:00:00.000Z'),
    decidedBy: null,
    decidedAt: null,
    rejectionReason: null,
  })
}

/** Construit un utilisateur du domaine ; par défaut, un employé sans manager de l'entreprise `acme`. */
export function aUser(
  id: string,
  overrides: { role?: UserRole; companyId?: string; managerId?: string | null } = {}
): User {
  return new User({
    id,
    companyId: overrides.companyId ?? 'acme',
    name: id,
    role: overrides.role ?? 'employee',
    managerId: overrides.managerId ?? null,
  })
}
