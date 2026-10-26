import type { ReceiptStorage } from '@/application/ports/ReceiptStorage'
import { deleteReceipt, getReceiptUrl, uploadReceipt } from '@/lib/storage'

/** Reçus stockés dans S3 (LocalStack en local), servis par URL pré-signée. */
export class S3ReceiptStorage implements ReceiptStorage {
  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await uploadReceipt(key, body, contentType)
  }

  async delete(key: string): Promise<void> {
    await deleteReceipt(key)
  }

  async getSignedUrl(key: string, expiresInSeconds = 300): Promise<string> {
    return getReceiptUrl(key, expiresInSeconds)
  }
}
