import { randomUUID } from 'node:crypto'
import {
  AlreadyDecidedError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
} from '@/domain/errors'
import { currentCorrelationId } from '@/lib/correlation'

// Erreurs au format RFC 9457 (Problem Details) pour les routes du nouveau
// contrat (docs/api/openapi.yaml, ADR 0004). Les anciennes routes gardent
// leur format `{ error }` jusqu'à l'étape « contrat » (étape 6).

/** Base des URI `type` : identifiant stable sur lequel le client réagit. */
const PROBLEM_TYPE_BASE = 'https://expense.io/problems/'

export interface ProblemFieldError {
  /** JSON Pointer vers le champ fautif du corps, ex. `#/decision`. */
  pointer: string
  detail: string
}

export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  errors?: ProblemFieldError[]
  correlationId?: string
}

export function problem(
  status: number,
  slug: string,
  title: string,
  extra: Omit<ProblemDetails, 'type' | 'title' | 'status'> = {}
): Response {
  const body: ProblemDetails = { type: `${PROBLEM_TYPE_BASE}${slug}`, title, status, ...extra }
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

export const unauthenticated = (instance: string) =>
  problem(401, 'unauthenticated', 'Authentification requise', { instance })

export const invalidRequest = (instance: string, errors: ProblemFieldError[]) =>
  problem(400, 'invalid-request', 'Requête invalide', { instance, errors })

/**
 * Traduit une erreur du domaine en problem ; toute autre erreur est un bug :
 * 500 générique, détail journalisé côté serveur avec un id de corrélation.
 */
export function problemFromError(error: unknown, instance: string): Response {
  if (error instanceof NotFoundError) {
    return problem(404, 'not-found', 'Ressource introuvable', { instance })
  }
  if (error instanceof ForbiddenError) {
    return problem(403, 'forbidden', 'Action interdite', { instance, detail: error.message })
  }
  if (error instanceof AlreadyDecidedError) {
    return problem(409, 'already-decided', 'Note déjà tranchée', { instance, detail: error.message })
  }
  if (error instanceof InvalidInputError) {
    return problem(422, 'invalid-input', 'Règle métier non respectée', {
      instance,
      detail: error.message,
      errors: [{ pointer: `#/${error.field}`, detail: error.message }],
    })
  }
  const correlationId = currentCorrelationId() ?? randomUUID()
  console.error(`[error] correlationId=${correlationId}`, error)
  return problem(500, 'internal', 'Erreur interne', { instance, correlationId })
}
