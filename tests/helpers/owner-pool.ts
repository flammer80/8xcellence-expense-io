import { Pool } from 'pg'
import { TEST_DATABASE_URL } from './test-database'

let pool: Pool | undefined

/**
 * Connexion propriétaire à la base de test : elle contourne la RLS, pour
 * préparer les données et vérifier l'état final sans passer par l'application.
 * L'application, elle, se connecte avec le rôle applicatif (`getPool`).
 */
export function ownerPool(): Pool {
  pool ??= new Pool({ connectionString: TEST_DATABASE_URL, max: 2 })
  return pool
}

export async function closeOwnerPool(): Promise<void> {
  await pool?.end()
  pool = undefined
}
