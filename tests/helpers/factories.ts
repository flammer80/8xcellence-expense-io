import type { UserRole } from '@/domain/User'
import { ownerPool } from './owner-pool'

export type Role = UserRole

export interface TestUser {
  id: string
  email: string
  role: Role
  companyId: string
}

export interface TestNote {
  id: string
  userId: string
  receiptKey: string
}

let sequence = 0
const next = () => ++sequence

/** Vide les trois tables entre deux tests (base de test uniquement). */
export async function resetDatabase(): Promise<void> {
  await ownerPool().query('TRUNCATE expense_notes, users, companies RESTART IDENTITY CASCADE')
}

export async function createCompany(name = `company-${next()}`): Promise<string> {
  const result = await ownerPool().query<{ id: string }>(
    'INSERT INTO companies (name, email_domain) VALUES ($1, $2) RETURNING id',
    [name, `${name}.test`]
  )
  return result.rows[0].id
}

export async function createUser(
  companyId: string,
  role: Role,
  options: { managerId?: string | null; name?: string } = {}
): Promise<TestUser> {
  const n = next()
  const email = `${role}-${n}@test.local`
  const result = await ownerPool().query<{ id: string }>(
    `INSERT INTO users (company_id, name, email, password_hash, role, manager_id)
     VALUES ($1, $2, $3, 'not-a-real-hash', $4, $5) RETURNING id`,
    [companyId, options.name ?? `${role} ${n}`, email, role, options.managerId ?? null]
  )
  return { id: result.rows[0].id, email, role, companyId }
}

export async function setManager(userId: string, managerId: string | null): Promise<void> {
  await ownerPool().query('UPDATE users SET manager_id = $1 WHERE id = $2', [managerId, userId])
}

export async function createNote(
  userId: string,
  options: {
    status?: 'pending' | 'approved' | 'rejected'
    amount?: number
    createdAt?: string
    description?: string
  } = {}
): Promise<TestNote> {
  const n = next()
  const receiptKey = `receipts/test-${n}.png`
  const result = await ownerPool().query<{ id: string }>(
    `INSERT INTO expense_notes (user_id, company_id, amount, expense_date, description, receipt_key, status, created_at)
     VALUES ($1, (SELECT company_id FROM users WHERE id = $1), $2, '2026-10-01', $3, $4, $5, COALESCE($6::timestamptz, now()))
     RETURNING id`,
    [
      userId,
      options.amount ?? 10,
      options.description ?? `note ${n}`,
      receiptKey,
      options.status ?? 'pending',
      options.createdAt ?? null,
    ]
  )
  return { id: result.rows[0].id, userId, receiptKey }
}

export async function getNoteStatus(noteId: string): Promise<string> {
  const result = await ownerPool().query<{ status: string }>(
    'SELECT status FROM expense_notes WHERE id = $1',
    [noteId]
  )
  return result.rows[0].status
}

export async function getManagerId(userId: string): Promise<string | null> {
  const result = await ownerPool().query<{ manager_id: string | null }>(
    'SELECT manager_id FROM users WHERE id = $1',
    [userId]
  )
  return result.rows[0].manager_id
}

/**
 * Une entreprise complète : un RH, un manager racine, un manager rattaché au
 * manager racine, et un employé rattaché à ce dernier.
 */
export async function createOrg(name?: string) {
  const companyId = await createCompany(name)
  const hr = await createUser(companyId, 'hr_admin')
  const rootManager = await createUser(companyId, 'manager')
  const manager = await createUser(companyId, 'manager', { managerId: rootManager.id })
  const employee = await createUser(companyId, 'employee', { managerId: manager.id })
  return { companyId, hr, rootManager, manager, employee }
}

/** Piste d'audit enregistrée pour une note (colonnes ajoutées par la migration 0002). */
export async function getNoteDecision(noteId: string) {
  const result = await ownerPool().query<{
    status: string
    decided_by: string | null
    decided_at: Date | null
    rejection_reason: string | null
  }>('SELECT status, decided_by, decided_at, rejection_reason FROM expense_notes WHERE id = $1', [noteId])
  return result.rows[0]
}

/** Notes de frais en base d'un auteur, avec leur entreprise et leur clé de reçu. */
export async function getNotesOf(userId: string) {
  const result = await ownerPool().query<{ id: string; company_id: string; receipt_key: string }>(
    'SELECT id, company_id, receipt_key FROM expense_notes WHERE user_id = $1',
    [userId]
  )
  return result.rows
}
