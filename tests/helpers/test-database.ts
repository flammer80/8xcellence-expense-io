/**
 * URL de la base de test, avec le rôle propriétaire (migrations, fixtures).
 * Elle doit désigner une base dont le nom finit par `_test` : le global setup
 * la supprime et la recrée à chaque exécution.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://expense:expense@localhost:5433/expense_io_test'

/**
 * Même base, avec le rôle applicatif `expense_app` (NOSUPERUSER NOBYPASSRLS) :
 * c'est lui que l'application utilise, donc lui que les tests exercent, pour
 * que les policies RLS s'appliquent vraiment (ADR 0005).
 */
export const TEST_APP_DATABASE_URL = withRole(process.env.TEST_APP_DATABASE_URL, 'expense_app')

/** Même base, avec le rôle du worker de l'outbox `expense_worker` (ADR 0007). */
export const TEST_WORKER_DATABASE_URL = withRole(process.env.TEST_WORKER_DATABASE_URL, 'expense_worker')

function withRole(override: string | undefined, role: string): string {
  if (override) return override
  const url = new URL(TEST_DATABASE_URL)
  url.username = role
  url.password = role
  return url.toString()
}
