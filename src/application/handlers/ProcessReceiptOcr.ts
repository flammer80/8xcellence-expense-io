import type { ReceiptOcrRequested } from '../messages'
import type { MessageHandler } from '../OutboxWorker'
import type { OcrService } from '../ports/OcrService'
import type { ReceiptStorage } from '../ports/ReceiptStorage'
import type { ReceiptSuggestionRepository } from '../ports/ReceiptSuggestionRepository'

/**
 * Consommateur du job `ReceiptOcrRequested` (v1) : analyse le reçu, enregistre
 * les champs reconnus, puis supprime le fichier temporaire.
 *
 * Idempotent : une demande déjà traitée (message rejoué) est ignorée.
 * En lettre morte, la demande passe à `failed` pour que le client arrête
 * d'attendre.
 */
export class ProcessReceiptOcr implements MessageHandler<ReceiptOcrRequested> {
  constructor(
    private readonly suggestions: ReceiptSuggestionRepository,
    private readonly files: ReceiptStorage,
    private readonly ocr: OcrService,
    private readonly now: () => Date = () => new Date()
  ) {}

  async handle(job: ReceiptOcrRequested): Promise<void> {
    const { suggestionId, requesterId } = job.payload
    const suggestion = await this.suggestions.findById(suggestionId, requesterId)
    if (!suggestion?.isPending()) return

    const bytes = await this.files.download(suggestion.fileKey)
    const fields = await this.ocr.suggest({ bytes, contentType: suggestion.contentType })
    await this.suggestions.saveResult(suggestion.complete(fields, this.now()), requesterId)
    await this.files.delete(suggestion.fileKey).catch(() => {})
  }

  async onDeadLetter(job: ReceiptOcrRequested): Promise<void> {
    const { suggestionId, requesterId } = job.payload
    const suggestion = await this.suggestions.findById(suggestionId, requesterId)
    if (!suggestion?.isPending()) return
    await this.suggestions.saveResult(suggestion.fail(this.now()), requesterId)
    await this.files.delete(suggestion.fileKey).catch(() => {})
  }
}
