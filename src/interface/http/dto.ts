import type { ExpenseNoteDecision, ExpenseNoteStatus } from '@/domain/ExpenseNote'
import type { ReceiptSuggestionStatus } from '@/domain/ReceiptSuggestion'
import type { UserRole } from '@/domain/User'

// Formes JSON échangées avec l'API (docs/api/openapi.yaml, schémas du même
// nom). **Seule déclaration** de ces types : le back les produit
// (`mappers.ts`), le front les consomme (`components/api/client.ts`) en
// `import type`, sans aucun code serveur embarqué. Les modifier est un
// changement de contrat.

/** Note de frais. Ne contient aucun détail de stockage (le reçu se lit par `GET …/receipt-url`). */
export interface ExpenseNoteDto {
  id: string
  userId: string
  amount: number
  /** `YYYY-MM-DD`. */
  expenseDate: string
  description: string
  status: ExpenseNoteStatus
  /** ISO 8601. */
  createdAt: string
}

/** Note à trancher, avec le nom de son auteur. */
export interface PendingApprovalDto extends ExpenseNoteDto {
  authorName: string
}

/** Membre de l'entreprise, vu par le RH (annuaire et rattachements). */
export interface CompanyUserDto {
  id: string
  name: string
  email: string
  role: Exclude<UserRole, 'hr_admin'>
  managerId: string | null
}

/** Décision annoncée à l'auteur d'une note. */
export interface NotificationDto {
  id: string
  noteId: string
  noteDescription: string
  decision: ExpenseNoteDecision
  rejectionReason: string | null
  createdAt: string
}

/** Demande d'analyse OCR (202 puis polling). */
export interface ReceiptSuggestionDto {
  id: string
  status: ReceiptSuggestionStatus
  /** Présents seulement si `status` vaut `done` et que l'OCR les a reconnus. */
  amount?: number
  expenseDate?: string
  createdAt: string
  completedAt: string | null
}

/** URL pré-signée d'un reçu, valable 5 minutes. */
export interface ReceiptUrlDto {
  url: string
}

/** Corps de `POST /api/expense-notes/{id}/decision`. */
export interface DecisionRequestDto {
  decision: ExpenseNoteDecision
  reason?: string
}

/** Corps de `PUT /api/users/{id}/manager`. */
export interface AssignManagerRequestDto {
  managerId: string | null
}

/** Erreur au format RFC 9457 (`application/problem+json`). */
export interface ProblemDto {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  errors?: { pointer: string; detail: string }[]
  correlationId?: string
  /** Message historique, gardé sur les routes qui renvoyaient `{ error }` (déprécié). */
  error?: string
}
