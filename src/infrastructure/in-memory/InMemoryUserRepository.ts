import type { UserRepository } from '@/application/ports/UserRepository'
import type { User } from '@/domain/User'

/** Adaptateur de test du `UserRepository`. */
export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>()

  constructor(initialUsers: User[] = []) {
    initialUsers.forEach((user) => this.users.set(user.id, user))
  }

  async findById(userId: string): Promise<User | null> {
    return this.users.get(userId) ?? null
  }

  async listByCompany(companyId: string): Promise<User[]> {
    return [...this.users.values()].filter((user) => user.worksFor(companyId))
  }
}
