/** Rôles d'un utilisateur ; même liste que la contrainte `CHECK` de la table `users`. */
export const USER_ROLES = ['employee', 'manager', 'hr_admin'] as const

/** Seule déclaration du type de rôle dans l'application : les autres modules l'importent. */
export type UserRole = (typeof USER_ROLES)[number]

export interface UserProps {
  id: string
  email: string
  name: string
  role: UserRole
  managerId: string | null
}

export class User {
  constructor(private readonly props: UserProps) {}

  get id(): string {
    return this.props.id
  }

  get role(): UserRole {
    return this.props.role
  }

  isRootManager(): boolean {
    return this.props.role === 'manager' && this.props.managerId === null
  }

  canManage(other: User): boolean {
    return this.props.role === 'manager' && other.props.managerId === this.props.id
  }
}
