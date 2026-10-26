// Ouvre la connexion du rôle applicatif `expense_app` (créé sans droit de
// connexion par la migration 0004) avec le mot de passe de DATABASE_URL.
// Le secret reste ainsi dans l'environnement, jamais dans une migration.
// Idempotent : relançable à chaque `make dev`.
import { config as loadEnv } from 'dotenv'
import pg from 'pg'

loadEnv({ quiet: true })

const appUrl = process.env.DATABASE_URL && new URL(process.env.DATABASE_URL)
const ownerUrl = process.env.MIGRATION_DATABASE_URL
if (!appUrl || !ownerUrl) {
  console.error('DATABASE_URL et MIGRATION_DATABASE_URL sont requises : lancez `make env` (voir .env.example).')
  process.exit(1)
}
if (appUrl.username !== 'expense_app') {
  console.error(`DATABASE_URL doit utiliser le rôle applicatif "expense_app", pas "${appUrl.username}" (ADR 0005).`)
  process.exit(1)
}

const client = new pg.Client({ connectionString: ownerUrl })
await client.connect()
try {
  const password = client.escapeLiteral(decodeURIComponent(appUrl.password))
  await client.query(`ALTER ROLE expense_app WITH LOGIN PASSWORD ${password}`)
  console.log('Rôle applicatif "expense_app" prêt.')
} finally {
  await client.end()
}
