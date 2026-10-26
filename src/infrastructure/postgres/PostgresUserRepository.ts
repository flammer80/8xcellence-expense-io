import type { UserRepository } from '@/application/ports/UserRepository'
import { InvalidInputError, NotFoundError } from '@/domain/errors'
import { User, type UserRole } from '@/domain/User'
import { withUserScope } from '@/lib/db'

interface UserRow {
  id: string
  company_id: string
  name: string
  email: string
  role: UserRole
  manager_id: string | null
}

const COLUMNS = 'id, company_id, name, email, role, manager_id'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function toUser(row: UserRow): User {
  return new User({
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    email: row.email,
    role: row.role,
    managerId: row.manager_id,
  })
}

/**
 * Utilisateurs stockés dans Postgres. Chaque requête passe par
 * `withUserScope` : la policy RLS de `users` limite la lecture à l'entreprise
 * de l'acteur, et la modification au rattachement fait par un RH.
 */
export class PostgresUserRepository implements UserRepository {
  async findById(userId: string, actorId: string): Promise<User | null> {
    if (!UUID.test(userId)) return null
    return withUserScope(actorId, async (client) => {
      const result = await client.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [userId])
      return result.rows[0] ? toUser(result.rows[0]) : null
    })
  }

  async listByCompany(companyId: string, actorId: string): Promise<User[]> {
    return withUserScope(actorId, async (client) => {
      const result = await client.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE company_id = $1 ORDER BY name`, [
        companyId,
      ])
      return result.rows.map(toUser)
    })
  }

  async saveManager(user: User, actorId: string): Promise<User> {
    return withUserScope(actorId, async (client) => {
      // Un rattachement à la fois par entreprise, jusqu'à la fin de la
      // transaction : le contrôle de cycle ci-dessous voit les rattachements
      // concurrents déjà validés.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`manager-assignment:${user.companyId}`])
      const updated = await client.query<UserRow>(
        `UPDATE users SET manager_id = $1 WHERE id = $2 RETURNING ${COLUMNS}`,
        [user.managerId, user.id]
      )
      if (!updated.rows[0]) throw new NotFoundError('Utilisateur', user.id)

      if (user.managerId !== null) {
        // Garde d'invariant (la règle vit dans `ManagerAssignment`) : UNION
        // arrête la remontée même si un cycle existe déjà.
        const cycle = await client.query(
          `WITH RECURSIVE chain AS (
             SELECT id, manager_id FROM users WHERE id = $1
             UNION
             SELECT u.id, u.manager_id FROM users u JOIN chain c ON u.id = c.manager_id
           )
           SELECT 1 FROM chain WHERE id = $2 LIMIT 1`,
          [user.managerId, user.id]
        )
        if (cycle.rows[0]) {
          throw new InvalidInputError('managerId', 'ce rattachement créerait un cycle hiérarchique')
        }
      }
      return toUser(updated.rows[0])
    })
  }
}
