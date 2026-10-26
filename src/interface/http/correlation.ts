import { withCorrelationId } from '@/lib/correlation'

/**
 * Enveloppe un route handler : la requête reçoit un id de corrélation (repris
 * de `X-Correlation-Id`, sinon généré), propagé jusqu'aux messages de
 * l'outbox et aux logs du worker, et renvoyé dans la réponse.
 */
export function traced<R extends Request, A extends unknown[]>(
  handler: (request: R, ...args: A) => Promise<Response>
): (request: R, ...args: A) => Promise<Response> {
  return (request, ...args) =>
    withCorrelationId(request, async (correlationId) => {
      const response = await handler(request, ...args)
      const headers = new Headers(response.headers)
      headers.set('X-Correlation-Id', correlationId)
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
    })
}
