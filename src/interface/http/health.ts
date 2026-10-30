import { problem } from './problemDetails'

/** Une dépendance à vérifier : résout si elle répond, rejette sinon. */
export type HealthCheck = (signal: AbortSignal) => Promise<unknown>

/** Durée maximale d'une vérification : une dépendance qui ne répond pas est « down ». */
export const HEALTH_CHECK_TIMEOUT_MS = 2000

async function probe(check: HealthCheck, timeoutMs: number): Promise<'up' | 'down'> {
  const controller = new AbortController()
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error('timeout'))
    }, timeoutMs)
  })
  try {
    await Promise.race([check(controller.signal), timeout])
    return 'up'
  } catch {
    return 'down'
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Sonde de disponibilité (ADR 0011) : 200 si toutes les dépendances
 * répondent, 503 (RFC 9457) sinon. Le corps ne dit que `up`/`down` par
 * dépendance : ni hôte, ni message d'erreur.
 */
export async function readinessResponse(
  checks: { postgres: HealthCheck; storage: HealthCheck },
  timeoutMs = HEALTH_CHECK_TIMEOUT_MS
): Promise<Response> {
  const [postgres, storage] = await Promise.all([probe(checks.postgres, timeoutMs), probe(checks.storage, timeoutMs)])
  const results = { postgres, storage }
  const headers = { 'Cache-Control': 'no-store' }
  if (postgres === 'up' && storage === 'up') {
    return Response.json({ status: 'ready', checks: results }, { headers })
  }
  const down = Object.entries(results)
    .filter(([, state]) => state === 'down')
    .map(([name]) => name)
  const response = problem(503, 'unavailable', 'Service indisponible', {
    instance: '/api/health/ready',
    detail: `Dépendance indisponible : ${down.join(', ')}.`,
    checks: results,
  })
  response.headers.set('Cache-Control', 'no-store')
  return response
}
