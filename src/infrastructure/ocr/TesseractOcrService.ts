import type { OcrService } from '@/application/ports/OcrService'
import type { SuggestedFields } from '@/domain/ReceiptSuggestion'
import { recognizeReceipt } from '@/lib/ocr'

/**
 * OCR local avec Tesseract (worker partagé, une analyse à la fois). Une panne
 * est propagée : le worker de l'outbox retentera puis passera la demande en
 * `failed`.
 */
export class TesseractOcrService implements OcrService {
  async suggest(file: { bytes: Buffer; contentType: string }): Promise<SuggestedFields> {
    const { amount, expenseDate } = await recognizeReceipt({ data: file.bytes, mimeType: file.contentType })
    return {
      ...(amount !== undefined && { amount }),
      ...(expenseDate !== undefined && { expenseDate }),
    }
  }
}
