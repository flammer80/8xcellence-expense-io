import type { ReceiptStorage } from '@/application/ports/ReceiptStorage'

/** Adaptateur de test du `ReceiptStorage` : garde les fichiers en mémoire, signe des URL factices. */
export class InMemoryReceiptStorage implements ReceiptStorage {
  readonly files = new Map<string, { body: Buffer; contentType: string }>()

  async upload(key: string, body: Buffer, contentType: string): Promise<void> {
    this.files.set(key, { body, contentType })
  }

  async download(key: string): Promise<Buffer> {
    const file = this.files.get(key)
    if (!file) throw new Error(`Objet introuvable : ${key}`)
    return file.body
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key)
  }

  async getSignedUrl(key: string, expiresInSeconds = 300): Promise<string> {
    return `memory://${key}?expires=${expiresInSeconds}`
  }
}
