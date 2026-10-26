// Appels de l'UI de validation (manager et RH) vers le nouveau contrat
// (docs/api/openapi.yaml). Un seul endroit pour les deux écrans ; le client
// d'API typé complet arrive à l'étape « contrat et front ».

export type DecisionAction = 'approve' | 'reject'

const DECISION_BY_ACTION = { approve: 'approved', reject: 'rejected' } as const

/**
 * Tranche une note via `POST /api/expense-notes/{id}/decision`.
 * @returns `null` si la décision est enregistrée, sinon un message lisible
 *   (le `detail` ou le `title` du problem RFC 9457).
 */
export async function decideNote(id: string, action: DecisionAction): Promise<string | null> {
  const response = await fetch(`/api/expense-notes/${id}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: DECISION_BY_ACTION[action] }),
  })
  if (response.ok) return null
  const problem = await response.json().catch(() => null)
  return problem?.detail ?? problem?.title ?? 'Échec de la décision sur cette note de frais.'
}

/** URL temporaire du reçu, via la route unique `GET /api/expense-notes/{id}/receipt-url`, ou `null`. */
export async function fetchReceiptUrl(id: string): Promise<string | null> {
  const response = await fetch(`/api/expense-notes/${id}/receipt-url`)
  if (!response.ok) return null
  const { url } = await response.json()
  return url
}
