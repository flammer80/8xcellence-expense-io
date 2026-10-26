import path from 'node:path'
import { runner } from 'node-pg-migrate'
import { Client } from 'pg'
import { TEST_APP_DATABASE_URL, TEST_DATABASE_URL, TEST_WORKER_DATABASE_URL } from './test-database'

/**
 * Recrée la base de test à partir de zéro, applique toutes les migrations
 * (exactement comme `npm run migrate:up` en local), puis ouvre la connexion
 * des rôles applicatif et worker, comme `npm run ensure-app-role`.
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

  const owner = new Client({ connectionString: TEST_DATABASE_URL })
  await owner.connect()
  try {
    for (const roleUrl of [TEST_APP_DATABASE_URL, TEST_WORKER_DATABASE_URL]) {
      const url = new URL(roleUrl)
      const password = owner.escapeLiteral(decodeURIComponent(url.password))
      await owner.query(`ALTER ROLE ${owner.escapeIdentifier(url.username)} WITH LOGIN PASSWORD ${password}`)
    }
  } finally {
    await owner.end()
  }
}
