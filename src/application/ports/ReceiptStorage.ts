/**
 * Stockage des reçus (fichiers justificatifs).
 *
 * Implémentation : `S3ReceiptStorage`. Pas encore branché sur un cas
 * d'usage : il le sera par `GetReceiptUrl` (étape 3) et `SubmitExpenseNote`
 * (étape 4).
 */
export interface ReceiptStorage {
  /** Dépose le fichier sous `key` ; écrase un objet existant de même clé. */
  upload(key: string, body: Buffer, contentType: string): Promise<void>
  /** URL de lecture temporaire ; `expiresInSeconds` vaut 300 par défaut. */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>
}
