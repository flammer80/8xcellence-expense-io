/**
 * Stockage des reçus (fichiers justificatifs).
 *
 * Implémentation : `S3ReceiptStorage`. Utilisé par `GetReceiptUrl` ; le sera
 * aussi par `SubmitExpenseNote` (étape 4).
 */
export interface ReceiptStorage {
  /** Dépose le fichier sous `key` ; écrase un objet existant de même clé. */
  upload(key: string, body: Buffer, contentType: string): Promise<void>
  /** URL de lecture temporaire ; `expiresInSeconds` vaut 300 par défaut. */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>
}
