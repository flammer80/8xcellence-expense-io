import { getWorkerPool } from '@/lib/db'

// Statistiques d'exploitation lues avec le rôle `expense_worker` : l'état de
// la file (table `outbox`, qu'il lit déjà) et des compteurs agrégés de notes
// en attente (fonction `app_pending_notes_by_age`, migration 0007). Aucune
// donnée métier ni personnelle.

export interface OutboxStats {
  /** Messages en attente de traitement (ni acquittés, ni en lettre morte). */
  pending: number
  /** Âge du plus vieux message en attente, en secondes (0 si la file est vide). */
  oldestPendingAgeSeconds: number
  /** Messages en lettre morte, à traiter manuellement. */
  deadLetters: number
}

export async function readOutboxStats(): Promise<OutboxStats> {
  const result = await getWorkerPool().query<{ pending: string; oldest_age: number | null; dead: string }>(
    `SELECT count(*) FILTER (WHERE processed_at IS NULL AND dead_at IS NULL) AS pending,
            extract(epoch FROM now() - min(occurred_at) FILTER (WHERE processed_at IS NULL AND dead_at IS NULL))::float8 AS oldest_age,
            count(*) FILTER (WHERE dead_at IS NOT NULL) AS dead
     FROM outbox`
  )
  const row = result.rows[0]
  return { pending: Number(row.pending), oldestPendingAgeSeconds: row.oldest_age ?? 0, deadLetters: Number(row.dead) }
}

/** Nombre de notes en attente par tranche d'âge (`lt_1d`, `1d_3d`, `3d_7d`, `gt_7d`). */
export async function readPendingNotesByAge(): Promise<Record<string, number>> {
  const result = await getWorkerPool().query<{ age_bucket: string; notes: string }>(
    'SELECT age_bucket, notes FROM app_pending_notes_by_age()'
  )
  const buckets: Record<string, number> = { lt_1d: 0, '1d_3d': 0, '3d_7d': 0, gt_7d: 0 }
  for (const row of result.rows) buckets[row.age_bucket] = Number(row.notes)
  return buckets
}
