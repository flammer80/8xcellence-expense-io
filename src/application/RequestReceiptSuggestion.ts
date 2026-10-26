import { InvalidInputError, NotFoundError } from '@/domain/errors'
import { ReceiptFile } from '@/domain/ReceiptFile'
import { ReceiptSuggestion } from '@/domain/ReceiptSuggestion'
import type { ReceiptOcrRequested } from './messages'
import type { ReceiptStorage } from './ports/ReceiptStorage'
import type { ReceiptSuggestionRepository } from './ports/ReceiptSuggestionRepository'
import type { UserRepository } from './ports/UserRepository'

/**
 * Taille maximale d'un reçu soumis à l'OCR : 5 Mo. L'analyse d'une grande
 * image monopolise le CPU (SEC-08) ; un ticket de caisse n'en a pas besoin.
 */
export const MAX_OCR_RECEIPT_BYTES = 5 * 1024 * 1024

export interface RequestReceiptSuggestionInput {
  /** Utilisateur connecté qui demande l'analyse. */
  actorId: string
  receipt: { bytes: Buffer; declaredType: string }
}

/**
 * Cas d'usage : demander l'analyse OCR d'un reçu, **sans attendre son
 * résultat** (ADR 0007). La requête HTTP répond 202 ; le client suit l'état
 * de la demande jusqu'à `done` ou `failed` (polling).
 *
 * Même ordre que la soumission d'une note (ADR 0006) : valider, déposer le
 * fichier temporaire, puis enregistrer la demande et son job
 * `ReceiptOcrRequested` en une transaction ; supprimer le fichier si
 * l'enregistrement échoue.
 *
 * Erreurs :
 * - `InvalidInputError` (`receipt.type`, `receipt.size`) : type non accepté,
 *   contenu qui ne correspond pas au type annoncé, ou plus de 5 Mo ;
 * - `NotFoundError` : l'acteur n'existe plus.
 */
export class RequestReceiptSuggestion {
  constructor(
    private readonly suggestions: ReceiptSuggestionRepository,
    private readonly users: UserRepository,
    private readonly files: ReceiptStorage,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID()
  ) {}

  async execute({ actorId, receipt }: RequestReceiptSuggestionInput): Promise<ReceiptSuggestion> {
    const file = ReceiptFile.from(receipt.bytes, receipt.declaredType)
    if (receipt.bytes.length > MAX_OCR_RECEIPT_BYTES) {
      throw new InvalidInputError('receipt.size', `au plus ${MAX_OCR_RECEIPT_BYTES} octets pour une analyse`)
    }

    const requester = await this.users.findById(actorId, actorId)
    if (!requester) throw new NotFoundError('Utilisateur', actorId)

    const id = this.newId()
    const suggestion = ReceiptSuggestion.request({
      id,
      requesterId: requester.id,
      companyId: requester.companyId,
      fileKey: `ocr/${requester.companyId}/${id}${file.extension}`,
      contentType: file.contentType,
      createdAt: this.now(),
    })
    const job: ReceiptOcrRequested = {
      id: this.newId(),
      type: 'ReceiptOcrRequested',
      version: 1,
      companyId: requester.companyId,
      occurredAt: suggestion.createdAt,
      payload: { suggestionId: id, requesterId: requester.id },
    }

    await this.files.upload(suggestion.fileKey, receipt.bytes, file.contentType)
    try {
      await this.suggestions.add(suggestion, actorId, job)
    } catch (error) {
      await this.files.delete(suggestion.fileKey).catch(() => {})
      throw error
    }
    return suggestion
  }
}
