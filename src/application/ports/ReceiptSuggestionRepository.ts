import type { ReceiptSuggestion } from '@/domain/ReceiptSuggestion'
import type { ReceiptOcrRequested } from '../messages'

/**
 * Demandes d'analyse OCR.
 *
 * `actorId` désigne l'utilisateur au nom duquel la requête s'exécute ; on ne
 * voit que ses propres demandes (policy RLS).
 *
 * Implémentations : `PostgresReceiptSuggestionRepository`,
 * `InMemoryReceiptSuggestionRepository` (tests).
 */
export interface ReceiptSuggestionRepository {
  /** Enregistre la demande **et** son job dans l'outbox, en une transaction. */
  add(suggestion: ReceiptSuggestion, actorId: string, job: ReceiptOcrRequested): Promise<void>

  findById(suggestionId: string, actorId: string): Promise<ReceiptSuggestion | null>

  /**
   * Enregistre l'état final, **seulement si la demande est encore en
   * attente** en base.
   * @returns `false` si elle avait déjà été traitée (message rejoué).
   */
  saveResult(suggestion: ReceiptSuggestion, actorId: string): Promise<boolean>
}
