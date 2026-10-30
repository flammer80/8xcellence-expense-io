import { randomUUID } from 'node:crypto'
import {
  AlreadyDecidedError,
  ForbiddenError,
  InvalidInputError,
  NotFoundError,
} from '@/domain/errors'
import { currentCorrelationId } from '@/lib/correlation'
import { logUnexpectedError } from '@/lib/logger'

// Erreurs au format RFC 9457 (Problem Details), pour toutes les routes du
// contrat (docs/api/openapi.yaml, ADR 0004 et 0008). Seules les anciennes
// routes dépréciées gardent leur format `{ error }` (legacyRoutes.ts).

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
  /** Message historique des routes qui renvoyaient `{ error }` (membre d'extension, déprécié). */
  error?: string
  /** État de chaque dépendance, sur le 503 de `GET /api/health/ready`. */
  checks?: Record<string, 'up' | 'down'>
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

export const unauthenticated = (instance: string, extra: { error?: string } = {}) =>
  problem(401, 'unauthenticated', 'Authentification requise', { instance, ...extra })

export const invalidRequest = (instance: string, errors: ProblemFieldError[], extra: { error?: string } = {}) =>
  problem(400, 'invalid-request', 'Requête invalide', { instance, errors, ...extra })

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
  logUnexpectedError(error, correlationId)
  return problem(500, 'internal', 'Erreur interne', { instance, correlationId })
}

/** Message historique `error` par champ refusé (`POST /api/expense-notes`) ; « Champs invalides » pour les autres. */
const LEGACY_MESSAGE_BY_FIELD: Record<string, string> = {
  'receipt.type': 'Type de fichier non autorisé pour le reçu',
  'receipt.size': 'Fichier trop volumineux',
}

/**
 * Variante de `problemFromError` pour les routes qui renvoyaient `{ error }`
 * avant RFC 9457 (`GET`/`POST /api/expense-notes`, `GET …/receipt-url`) :
 * même problem, **codes historiques** (400 pour un champ refusé, 404 pour
 * une note invisible), plus le membre `error` d'origine pour que leurs
 * consommateurs ne cassent pas (ADR 0008).
 */
export function legacyCompatibleProblem(error: unknown, instance: string): Response {
  if (error instanceof NotFoundError || error instanceof ForbiddenError) {
    return problem(404, 'not-found', 'Ressource introuvable', { instance, error: 'Not found' })
  }
  if (error instanceof InvalidInputError) {
    return problem(400, 'invalid-request', 'Requête invalide', {
      instance,
      detail: error.message,
      errors: [{ pointer: `#/${error.field}`, detail: error.message }],
      error: LEGACY_MESSAGE_BY_FIELD[error.field] ?? 'Champs invalides',
    })
  }
  const correlationId = currentCorrelationId() ?? randomUUID()
  logUnexpectedError(error, correlationId)
  return problem(500, 'internal', 'Erreur interne', { instance, correlationId, error: 'Internal Server Error' })
}
