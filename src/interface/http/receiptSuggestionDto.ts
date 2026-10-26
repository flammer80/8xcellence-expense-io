import type { ReceiptSuggestion, ReceiptSuggestionStatus } from '@/domain/ReceiptSuggestion'

/** Demande d'analyse OCR telle que l'API la renvoie (docs/api/openapi.yaml, `ReceiptSuggestion`). */
export interface ReceiptSuggestionDto {
  id: string
  status: ReceiptSuggestionStatus
  /** Présents seulement si `status` vaut `done` et que l'OCR les a reconnus. */
  amount?: number
  expenseDate?: string
  createdAt: string
  completedAt: string | null
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
