import type { ReceiptStorage } from '@/application/ports/ReceiptStorage'
import { getReceiptUrl, uploadReceipt } from '@/lib/storage'

/** Reçus stockés dans S3 (LocalStack en local), servis par URL pré-signée. */
export class S3ReceiptStorage implements ReceiptStorage {
  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await uploadReceipt(key, body, contentType)
  }

  async getSignedUrl(key: string, expiresInSeconds = 300): Promise<string> {
    return getReceiptUrl(key, expiresInSeconds)
  }
}
