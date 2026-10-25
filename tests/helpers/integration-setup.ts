import { afterAll, beforeEach, vi } from 'vitest'
import { TEST_DATABASE_URL } from './test-database'

// Doit précéder le premier import de `@/lib/db` : le pool lit DATABASE_URL
// à sa création.
process.env.DATABASE_URL = TEST_DATABASE_URL

// La session NextAuth est simulée : chaque test choisit son utilisateur via
// `signInAs` (tests/helpers/session.ts).
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))

// S3 et l'OCR sont simulés ; le reste de lib/storage (nommage des clés) est réel.
vi.mock('@/lib/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage')>()),
  uploadReceipt: vi.fn(async () => {}),
  getReceiptUrl: vi.fn(async (key: string) => `https://s3.test/${key}?signed`),
}))
vi.mock('@/lib/ocr', () => ({ suggestFields: vi.fn(async () => ({})) }))

beforeEach(async () => {
  vi.clearAllMocks()
  const { resetDatabase } = await import('./factories')
  await resetDatabase()
})

afterAll(async () => {
  const { getPool } = await import('@/lib/db')
  await getPool().end()
  globalThis.__pgPool = undefined
})
