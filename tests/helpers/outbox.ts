import { vi } from 'vitest'
import { ownerPool } from './owner-pool'

/**
 * Traite tous les messages disponibles de l'outbox avec le worker réel
 * (rôle `expense_worker`, consommateurs de `composition.ts`), comme le ferait
 * la boucle de fond. Ses logs JSON sont masqués.
 */
export async function drainOutbox(): Promise<void> {
  const { outboxWorker } = await import('@/composition')
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await outboxWorker.drain()
  } finally {
    log.mockRestore()
  }
}

export interface OutboxRow {
  id: string
  company_id: string
  type: string
  version: number
  payload: Record<string, unknown>
  correlation_id: string | null
  attempts: number
  last_error: string | null
  processed_at: Date | null
  dead_at: Date | null
}

/** Contenu de l'outbox, lu avec le rôle propriétaire (l'application, elle, ne peut pas le lire). */
export async function outboxRows(): Promise<OutboxRow[]> {
  const result = await ownerPool().query<OutboxRow>('SELECT * FROM outbox ORDER BY occurred_at')
  return result.rows
}

/** Rend tous les messages immédiatement disponibles (saute le délai de retry). */
export async function makeOutboxReady(): Promise<void> {
  await ownerPool().query('UPDATE outbox SET available_at = now() - interval \'1 second\'')
}
