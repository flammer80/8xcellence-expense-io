import { randomUUID } from 'node:crypto'
import { currentCorrelationId } from './correlation'

/**
 * Réponse 500 générique. Le détail de l'erreur (message, stack, SQL) reste
 * dans les logs serveur ; le client ne reçoit qu'un id de corrélation pour
 * retrouver l'occurrence (SEC-07).
 */
export function respondError(error: unknown): Response {
  const correlationId = currentCorrelationId() ?? randomUUID()
  console.error(`[error] correlationId=${correlationId}`, error)
  return Response.json({ error: 'Internal Server Error', correlationId }, { status: 500 })
}
