import { NotFoundError } from '@/domain/errors'
import type { ReceiptSuggestion } from '@/domain/ReceiptSuggestion'
import type { ReceiptSuggestionRepository } from './ports/ReceiptSuggestionRepository'

/**
 * Cas d'usage : suivre une demande d'analyse OCR (polling, ADR 0007).
 *
 * Erreurs : `NotFoundError` si la demande n'existe pas ou n'appartient pas à
 * l'acteur ; on ne distingue pas les deux cas.
 */
export class GetReceiptSuggestion {
  constructor(private readonly suggestions: ReceiptSuggestionRepository) {}

  async execute({ suggestionId, actorId }: { suggestionId: string; actorId: string }): Promise<ReceiptSuggestion> {
    const suggestion = await this.suggestions.findById(suggestionId, actorId)
    if (!suggestion || suggestion.requesterId !== actorId) {
      throw new NotFoundError('Suggestion', suggestionId)
    }
    return suggestion
  }
}
