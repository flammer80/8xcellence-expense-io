/**
 * Stockage des reçus (fichiers justificatifs).
 *
 * Implémentations : `S3ReceiptStorage` (production) et
 * `InMemoryReceiptStorage` (tests). Utilisé par `SubmitExpenseNote`,
 * `GetReceiptUrl` et l'analyse OCR (fichiers temporaires `ocr/…`).
 */
export interface ReceiptStorage {
  /** Dépose le fichier sous `key` ; écrase un objet existant de même clé. */
  upload(key: string, body: Buffer, contentType: string): Promise<void>
  /** Contenu de l'objet `key`. @throws si l'objet n'existe pas. */
  download(key: string): Promise<Buffer>
  /**
   * Supprime l'objet `key` ; sans effet s'il n'existe pas. Sert à compenser
   * une soumission dont l'insertion en base a échoué (ADR 0006).
   */
  delete(key: string): Promise<void>
  /** URL de lecture temporaire ; `expiresInSeconds` vaut 300 par défaut. */
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>
}
