import { afterAll, beforeEach, vi } from 'vitest'
import { TEST_APP_DATABASE_URL, TEST_WORKER_DATABASE_URL } from './test-database'

// Doit précéder le premier import de `@/lib/db` : le pool lit DATABASE_URL
// à sa création. L'application se connecte avec le rôle applicatif, comme en
// production ; les fixtures passent par `ownerPool` (tests/helpers/owner-pool.ts).
process.env.DATABASE_URL = TEST_APP_DATABASE_URL
process.env.WORKER_DATABASE_URL = TEST_WORKER_DATABASE_URL

// La session NextAuth est simulée : chaque test choisit son utilisateur via
// `signInAs` (tests/helpers/session.ts).
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

// S3 et l'OCR sont simulés ; le reste de lib/storage (nommage des clés) est réel.
vi.mock('@/lib/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage')>()),
  uploadReceipt: vi.fn(async () => {}),
  downloadReceipt: vi.fn(async () => Buffer.from([0x89, 0x50, 0x4e, 0x47])),
  deleteReceipt: vi.fn(async () => {}),
  getReceiptUrl: vi.fn(async (key: string) => `https://s3.test/${key}?signed`),
}))
vi.mock('@/lib/ocr', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ocr')>()),
  suggestFields: vi.fn(async () => ({})),
  recognizeReceipt: vi.fn(async () => ({})),
}))
// Le worker de fond n'est jamais lancé en test : chaque test vide la file
// lui-même (`drainOutbox`, tests/helpers/outbox.ts).

beforeEach(async () => {
  vi.clearAllMocks()
  const { resetDatabase } = await import('./factories')
  await resetDatabase()
})

afterAll(async () => {
  const { closeOwnerPool } = await import('./owner-pool')
  await closeOwnerPool()
  const { getPool } = await import('@/lib/db')
  await getPool().end()
  globalThis.__pgPool = undefined
  if (globalThis.__pgWorkerPool) {
    await globalThis.__pgWorkerPool.end()
    globalThis.__pgWorkerPool = undefined
  }
})
