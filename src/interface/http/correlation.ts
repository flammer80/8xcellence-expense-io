import { withCorrelationId } from '@/lib/correlation'
import { logSecurityEvent } from '@/lib/logger'
import { appMetrics } from '@/lib/telemetry'

/** Identifiants dans un chemin : remplacés par `{id}` pour garder peu de séries de métriques. */
const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi

/** Modèle de route d'une URL (`/api/expense-notes/{id}/decision`). */
export function routeTemplate(url: string): string {
  return new URL(url, 'http://localhost').pathname.replace(UUID_SEGMENT, '/{id}')
}

/**
 * Enveloppe un route handler (toutes les routes de `src/app/api`) :
 * - la requête reçoit un id de corrélation (repris de `X-Correlation-Id`,
 *   posé par `proxy.ts`, sinon généré), propagé jusqu'aux messages de
 *   l'outbox et aux logs, et renvoyé dans la réponse ;
 * - sa durée est mesurée par route, méthode et code (`http.route.duration`),
 *   ce qui donne latence et taux d'erreur par route (ADR 0011) ;
 * - un refus 403 est journalisé comme événement de sécurité.
 *
 * La requête est facultative pour les appels directs des tests.
 */
export function traced<R extends Request, A extends unknown[]>(
  handler: (request: R, ...args: A) => Promise<Response>
): (request?: R, ...args: A) => Promise<Response> {
  return (request, ...args) => {
    const incoming = request ?? (new Request('http://localhost/') as R)
    return withCorrelationId(incoming, async (correlationId) => {
      const start = performance.now()
      const route = routeTemplate(incoming.url)
      let status = 500
      try {
        const response = await handler(incoming, ...args)
        status = response.status
        const headers = new Headers(response.headers)
        headers.set('X-Correlation-Id', correlationId)
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
      } finally {
        const attributes = { 'http.route': route, 'http.request.method': incoming.method, 'http.response.status_code': status }
        appMetrics().routeDuration.record((performance.now() - start) / 1000, attributes)
        if (status === 403) {
          appMetrics().forbidden.add(1, { 'http.route': route })
          logSecurityEvent('forbidden', { route, method: incoming.method })
        }
      }
    })
  }
}
