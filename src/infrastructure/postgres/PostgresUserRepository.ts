import type { UserRepository } from '@/application/ports/UserRepository'
import { User, type UserRole } from '@/domain/User'
import { getPool } from '@/lib/db'

interface UserRow {
  id: string
  company_id: string
  name: string
  role: UserRole
  manager_id: string | null
}

const COLUMNS = 'id, company_id, name, role, manager_id'

function toUser(row: UserRow): User {
  return new User({
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    role: row.role,
    managerId: row.manager_id,
  })
}

/**
 * Utilisateurs stockés dans Postgres. La table `users` n'a pas encore de
 * policy RLS (prévue avec l'isolation par entreprise, étape 4) : ces lectures
 * passent par le pool.
 */
export class PostgresUserRepository implements UserRepository {
  async findById(userId: string): Promise<User | null> {
    const result = await getPool().query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [userId])
    return result.rows[0] ? toUser(result.rows[0]) : null
  }

  async listByCompany(companyId: string): Promise<User[]> {
    const result = await getPool().query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE company_id = $1`, [
      companyId,
    ])
    return result.rows.map(toUser)
  }
}
