/**
 * Clé d'un reçu dans le stockage objet : `receipts/{companyId}/{noteId}{ext}`.
 *
 * - L'UUID de la note la rend impossible à deviner (l'ancienne clé
 *   `receipts/{seq}` révélait le volume de notes, DAT-03).
 * - Elle est connue **avant** l'insertion : le fichier part en premier, la
 *   note ensuite, en une seule écriture (ADR 0006).
 * - Le préfixe d'entreprise prépare une rétention, une purge ou un stockage
 *   régional par client.
 */
export function receiptKeyFor(companyId: string, noteId: string, extension: string): string {
  return `receipts/${companyId}/${noteId}${extension}`
}
