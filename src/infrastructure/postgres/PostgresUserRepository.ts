import type { UserRepository } from '@/application/ports/UserRepository'
import { User, type UserRole } from '@/domain/User'
import { withUserScope } from '@/lib/db'

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
 * Utilisateurs stockés dans Postgres. Chaque requête passe par
 * `withUserScope` : la policy RLS de `users` limite la lecture à l'entreprise
 * de l'acteur.
 */
export class PostgresUserRepository implements UserRepository {
  async findById(userId: string, actorId: string): Promise<User | null> {
    return withUserScope(actorId, async (client) => {
      const result = await client.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [userId])
      return result.rows[0] ? toUser(result.rows[0]) : null
    })
  }

  async listByCompany(companyId: string, actorId: string): Promise<User[]> {
    return withUserScope(actorId, async (client) => {
      const result = await client.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE company_id = $1`, [
        companyId,
      ])
      return result.rows.map(toUser)
    })
  }
}
