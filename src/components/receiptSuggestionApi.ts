// Pré-remplissage d'une note depuis son reçu, via l'API asynchrone
// (docs/api/openapi.yaml, ADR 0007) : `POST /api/receipt-suggestions` répond
// 202 avec un lien de suivi, que l'on interroge jusqu'à un état final.

export interface ReceiptSuggestion {
  status: 'pending' | 'done' | 'failed'
  amount?: number
  expenseDate?: string
}

const POLL_INTERVAL_MS = 1000
/** Au-delà, on abandonne : l'utilisateur saisit les champs à la main. */
const POLL_TIMEOUT_MS = 30_000

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Demande l'analyse d'un reçu et attend son résultat.
 * @returns la suggestion finale, ou un message d'erreur lisible.
 */
export async function suggestFromReceipt(
  receipt: File
): Promise<{ ok: true; suggestion: ReceiptSuggestion } | { ok: false; message: string }> {
  const formData = new FormData()
  formData.set('receipt', receipt)
  const accepted = await fetch('/api/receipt-suggestions', { method: 'POST', body: formData })
  const location = accepted.headers.get('Location')
  if (accepted.status !== 202 || !location) {
    const problem = await accepted.json().catch(() => null)
    return { ok: false, message: problem?.detail ?? 'Impossible d’analyser ce reçu.' }
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    await wait(POLL_INTERVAL_MS)
    const response = await fetch(location)
    if (!response.ok) break
    const suggestion = (await response.json()) as ReceiptSuggestion
    if (suggestion.status === 'done') return { ok: true, suggestion }
    if (suggestion.status === 'failed') break
  }
  return { ok: false, message: 'L’analyse du reçu n’a pas abouti — saisis les champs manuellement.' }
}
