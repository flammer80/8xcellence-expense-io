import path from 'node:path'
import { runner } from 'node-pg-migrate'
import { Client } from 'pg'
import { TEST_DATABASE_URL } from './test-database'

/**
 * Recrée la base de test à partir de zéro puis applique toutes les
 * migrations, exactement comme `npm run migrate:up` en local.
 */
export default async function setup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL)
  const databaseName = url.pathname.slice(1)
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refus de recréer "${databaseName}" : le nom doit finir par "_test".`)
  }

  const adminUrl = new URL(TEST_DATABASE_URL)
  adminUrl.pathname = '/postgres'
  const admin = new Client({ connectionString: adminUrl.toString() })
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
    await admin.query(`CREATE DATABASE "${databaseName}"`)
  } finally {
    await admin.end()
  }

  await runner({
    databaseUrl: TEST_DATABASE_URL,
    dir: path.resolve(__dirname, '../../migrations'),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  })
}
