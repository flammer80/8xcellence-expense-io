import { randomUUID } from 'node:crypto'
import { currentCorrelationId } from './correlation'
import { logUnexpectedError } from './logger'

/**
 * Réponse 500 générique. Le détail de l'erreur (message, stack, SQL) reste
 * dans les logs serveur ; le client ne reçoit qu'un id de corrélation pour
 * retrouver l'occurrence (SEC-07).
 */
export function respondError(error: unknown): Response {
  const correlationId = currentCorrelationId() ?? randomUUID()
  logUnexpectedError(error, correlationId)
  return Response.json({ error: 'Internal Server Error', correlationId }, { status: 500 })
}
