import type { ExpenseNoteDecision } from '@/domain/ExpenseNote'
import type { ProblemFieldError } from './problemDetails'

/** Corps de `POST /api/expense-notes/{id}/decision` (schéma `DecisionRequest` de openapi.yaml). */
export interface DecisionRequest {
  decision: ExpenseNoteDecision
  reason?: string
}

const DECISIONS: readonly string[] = ['approved', 'rejected'] satisfies ExpenseNoteDecision[]
const ALLOWED_FIELDS = new Set(['decision', 'reason'])

export type ParsedDecisionRequest =
  | { ok: true; value: DecisionRequest }
  | { ok: false; errors: ProblemFieldError[] }

/**
 * Valide la forme du corps (types, champs connus). Les règles métier (motif
 * réservé au rejet, longueur) restent dans le domaine et donnent un 422.
 */
export function parseDecisionRequest(body: unknown): ParsedDecisionRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, errors: [{ pointer: '#', detail: 'un objet JSON est attendu' }] }
  }
  const fields = body as Record<string, unknown>
  const errors: ProblemFieldError[] = []

  if (typeof fields.decision !== 'string' || !DECISIONS.includes(fields.decision)) {
    errors.push({ pointer: '#/decision', detail: 'doit valoir "approved" ou "rejected"' })
  }
  if (fields.reason !== undefined && typeof fields.reason !== 'string') {
    errors.push({ pointer: '#/reason', detail: 'doit être une chaîne' })
  }
  for (const field of Object.keys(fields)) {
    if (!ALLOWED_FIELDS.has(field)) errors.push({ pointer: `#/${field}`, detail: 'champ inconnu' })
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: { decision: fields.decision as ExpenseNoteDecision, reason: fields.reason as string | undefined },
  }
}
