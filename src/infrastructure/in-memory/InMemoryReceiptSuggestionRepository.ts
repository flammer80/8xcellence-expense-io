import type { ReceiptOcrRequested } from '@/application/messages'
import type { ReceiptSuggestionRepository } from '@/application/ports/ReceiptSuggestionRepository'
import type { ReceiptSuggestion } from '@/domain/ReceiptSuggestion'

/** Adaptateur de test : garde les demandes et leurs jobs en mémoire. */
export class InMemoryReceiptSuggestionRepository implements ReceiptSuggestionRepository {
  private readonly suggestions = new Map<string, ReceiptSuggestion>()
  readonly jobs: ReceiptOcrRequested[] = []

  async add(suggestion: ReceiptSuggestion, _actorId: string, job: ReceiptOcrRequested): Promise<void> {
    this.suggestions.set(suggestion.id, suggestion)
    this.jobs.push(job)
  }

  async findById(suggestionId: string, actorId: string): Promise<ReceiptSuggestion | null> {
    const suggestion = this.suggestions.get(suggestionId)
    return suggestion?.requesterId === actorId ? suggestion : null
  }

  async saveResult(suggestion: ReceiptSuggestion): Promise<boolean> {
    if (!this.suggestions.get(suggestion.id)?.isPending()) return false
    this.suggestions.set(suggestion.id, suggestion)
    return true
  }
}
