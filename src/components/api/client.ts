import type {
  AssignManagerRequestDto,
  CompanyUserDto,
  DecisionRequestDto,
  ExpenseNoteDto,
  NotificationDto,
  PendingApprovalDto,
  ProblemDto,
  ReceiptSuggestionDto,
  ReceiptUrlDto,
} from '@/interface/http/dto'

// Client d'API du front : le seul endroit où l'UI appelle `fetch`. Les types
// viennent du back (`interface/http/dto.ts`, en `import type` : rien de
// serveur n'est embarqué), donc front et back ne peuvent pas diverger sans
// que `npm run typecheck` échoue (ADR 0008).

/** Résultat d'un appel : la donnée, ou un message lisible tiré du problem RFC 9457. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string; problem: ProblemDto | null }

async function call<T>(path: string, init: RequestInit, fallbackMessage: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, init)
    if (response.ok) return { ok: true, data: (await response.json()) as T }
    const problem = (await response.json().catch(() => null)) as ProblemDto | null
    const fieldDetail = problem?.errors?.[0]?.detail
    return { ok: false, message: problem?.detail ?? fieldDetail ?? fallbackMessage, problem }
  } catch {
    return { ok: false, message: 'Le serveur ne répond pas. Réessaie dans un instant.', problem: null }
  }
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const api = {
  listMyExpenseNotes: () =>
    call<ExpenseNoteDto[]>('/api/expense-notes', {}, 'Impossible de charger les notes de frais.'),

  submitExpenseNote: (form: FormData) =>
    call<ExpenseNoteDto>('/api/expense-notes', { method: 'POST', body: form }, 'Échec de la soumission de la note.'),

  listPendingApprovals: () =>
    call<PendingApprovalDto[]>('/api/expense-notes/pending', {}, 'Impossible de charger les notes en attente.'),

  decide: (noteId: string, body: DecisionRequestDto) =>
    call<ExpenseNoteDto>(
      `/api/expense-notes/${noteId}/decision`,
      json('POST', body),
      'Échec de la décision sur cette note.'
    ),

  receiptUrl: (noteId: string) =>
    call<ReceiptUrlDto>(`/api/expense-notes/${noteId}/receipt-url`, {}, 'Impossible de récupérer le reçu.'),

  listCompanyUsers: () => call<CompanyUserDto[]>('/api/users', {}, "Impossible de charger l'annuaire."),

  assignManager: (userId: string, body: AssignManagerRequestDto) =>
    call<CompanyUserDto>(`/api/users/${userId}/manager`, json('PUT', body), "Échec du rattachement."),

  listNotifications: () => call<NotificationDto[]>('/api/notifications', {}, 'Impossible de charger les notifications.'),

  /**
   * Demande l'analyse OCR d'un reçu (202), puis interroge le lien de suivi
   * jusqu'à un état final (ADR 0007). Abandonne après 30 s.
   */
  async suggestFromReceipt(receipt: File): Promise<ApiResult<ReceiptSuggestionDto>> {
    const form = new FormData()
    form.set('receipt', receipt)
    const accepted = await fetch('/api/receipt-suggestions', { method: 'POST', body: form }).catch(() => null)
    const location = accepted?.headers.get('Location')
    if (!accepted || accepted.status !== 202 || !location) {
      const problem = (await accepted?.json().catch(() => null)) as ProblemDto | null
      return { ok: false, message: problem?.detail ?? 'Impossible d’analyser ce reçu.', problem }
    }

    const deadline = Date.now() + OCR_POLL_TIMEOUT_MS
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, OCR_POLL_INTERVAL_MS))
      const result = await call<ReceiptSuggestionDto>(location, {}, '')
      if (!result.ok || result.data.status === 'failed') break
      if (result.data.status === 'done') return result
    }
    return { ok: false, message: 'L’analyse du reçu n’a pas abouti : saisis les champs manuellement.', problem: null }
  },
}

const OCR_POLL_INTERVAL_MS = 1000
const OCR_POLL_TIMEOUT_MS = 30_000

/** Ouvre le reçu d'une note dans un nouvel onglet. @returns un message d'erreur, ou `null`. */
export async function openReceipt(noteId: string): Promise<string | null> {
  const result = await api.receiptUrl(noteId)
  if (!result.ok) return result.message
  window.open(result.data.url, '_blank', 'noopener,noreferrer')
  return null
}
