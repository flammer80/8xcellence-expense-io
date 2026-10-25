/**
 * URL de la base de test. Elle doit désigner une base dont le nom finit par
 * `_test` : le global setup la supprime et la recrée à chaque exécution.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://expense:expense@localhost:5433/expense_io_test'
