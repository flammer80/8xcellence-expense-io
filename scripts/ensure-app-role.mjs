// Ouvre la connexion des rôles `expense_app` (migration 0004) et
// `expense_worker` (migration 0005), créés sans droit de connexion, avec les
// mots de passe de DATABASE_URL et WORKER_DATABASE_URL. Les secrets restent
// ainsi dans l'environnement, jamais dans une migration.
// Idempotent : relançable à chaque `make dev`.
import { config as loadEnv } from 'dotenv'
import pg from 'pg'

loadEnv({ quiet: true })

/** Rôle attendu pour chaque variable d'environnement (ADR 0005, 0007). */
const ROLES = [
  { variable: 'DATABASE_URL', role: 'expense_app' },
  { variable: 'WORKER_DATABASE_URL', role: 'expense_worker' },
]

const ownerUrl = process.env.MIGRATION_DATABASE_URL
const missing = ['MIGRATION_DATABASE_URL', ...ROLES.map((r) => r.variable)].filter((v) => !process.env[v])
if (missing.length > 0) {
  console.error(`${missing.join(', ')} requise(s) : lancez \`make env\` (voir .env.example).`)
  process.exit(1)
}

const client = new pg.Client({ connectionString: ownerUrl })
await client.connect()
try {
  for (const { variable, role } of ROLES) {
    const url = new URL(process.env[variable])
    if (url.username !== role) {
      console.error(`${variable} doit utiliser le rôle "${role}", pas "${url.username}".`)
      process.exitCode = 1
      continue
    }
    const password = client.escapeLiteral(decodeURIComponent(url.password))
    await client.query(`ALTER ROLE ${client.escapeIdentifier(role)} WITH LOGIN PASSWORD ${password}`)
    console.log(`Rôle "${role}" prêt.`)
  }
} finally {
  await client.end()
}
