import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

// Id de corrélation d'une requête HTTP : il suit la requête jusqu'aux
// messages de l'outbox, puis jusqu'aux logs du worker qui les traite
// (traçabilité de l'asynchrone, CLAUDE.md §11).

const storage = new AsyncLocalStorage<string>()

/** Un id fourni par le client (`X-Correlation-Id`) n'est repris que s'il est court et sans caractère exotique. */
const ACCEPTABLE_ID = /^[A-Za-z0-9._-]{8,64}$/

/** Exécute `fn` avec l'id de corrélation de la requête (repris de `X-Correlation-Id`, sinon généré). */
export function withCorrelationId<T>(request: Request, fn: (correlationId: string) => Promise<T>): Promise<T> {
  const provided = request.headers.get('x-correlation-id')
  const id = provided && ACCEPTABLE_ID.test(provided) ? provided : randomUUID()
  return storage.run(id, () => fn(id))
}

/** Id de corrélation de la requête en cours, s'il y en a une. */
export function currentCorrelationId(): string | undefined {
  return storage.getStore()
}
