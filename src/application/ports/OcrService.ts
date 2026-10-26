import type { SuggestedFields } from '@/domain/ReceiptSuggestion'

/**
 * Reconnaissance de texte sur un reçu (commodité : *buy* plutôt que *build*,
 * cours n°2).
 *
 * Ne lève pas pour un reçu illisible : renvoie simplement des champs vides.
 * Peut lever pour une panne technique ; le worker retentera alors.
 *
 * Implémentation : `TesseractOcrService`.
 */
export interface OcrService {
  suggest(file: { bytes: Buffer; contentType: string }): Promise<SuggestedFields>
}
