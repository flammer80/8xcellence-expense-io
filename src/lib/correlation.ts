import { AsyncLocalStorage } from 'node:async_hooks'
import { correlationIdFrom } from './correlationId'

// Id de corrélation d'une requête HTTP : il suit la requête jusqu'aux
// messages de l'outbox, puis jusqu'aux logs du worker qui les traite
// (traçabilité de l'asynchrone, CLAUDE.md §11).

const storage = new AsyncLocalStorage<string>()

/** Exécute `fn` avec l'id de corrélation de la requête (repris de `X-Correlation-Id`, sinon généré). */
export function withCorrelationId<T>(request: Request, fn: (correlationId: string) => Promise<T>): Promise<T> {
  const id = correlationIdFrom(request.headers.get('x-correlation-id'))
  return storage.run(id, () => fn(id))
}

/** Exécute `fn` avec un id de corrélation connu (traitement d'un message de l'outbox par le worker). */
export function runWithCorrelationId<T>(id: string, fn: () => T): T {
  return storage.run(id, fn)
}

/** Id de corrélation de la requête en cours, s'il y en a une. */
export function currentCorrelationId(): string | undefined {
  return storage.getStore()
}
