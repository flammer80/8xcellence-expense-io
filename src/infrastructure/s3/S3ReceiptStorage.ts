import type { ReceiptStorage } from '@/application/ports/ReceiptStorage'
import { deleteReceipt, downloadReceipt, getReceiptUrl, uploadReceipt } from '@/lib/storage'
import { appMetrics, measure } from '@/lib/telemetry'

/**
 * Reçus stockés dans S3 (LocalStack en local), servis par URL pré-signée.
 * Chaque appel est mesuré (`storage.operation.duration`, par opération et
 * issue) ; les spans S3 viennent de l'instrumentation aws-sdk (ADR 0011).
 */
export class S3ReceiptStorage implements ReceiptStorage {
  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    await timed('upload', () => uploadReceipt(key, body, contentType))
  }

  async download(key: string): Promise<Buffer> {
    return timed('download', () => downloadReceipt(key))
  }

  async delete(key: string): Promise<void> {
    await timed('delete', () => deleteReceipt(key))
  }

  async getSignedUrl(key: string, expiresInSeconds = 300): Promise<string> {
    return timed('sign-url', () => getReceiptUrl(key, expiresInSeconds))
  }
}

function timed<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  return measure(appMetrics().storageDuration, { operation }, fn)
}
