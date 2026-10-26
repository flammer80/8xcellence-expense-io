/** Rôles d'un utilisateur ; même liste que la contrainte `CHECK` de la table `users`. */
export const USER_ROLES = ['employee', 'manager', 'hr_admin'] as const

/** Seule déclaration du type de rôle dans l'application : les autres modules l'importent. */
export type UserRole = (typeof USER_ROLES)[number]

export interface UserProps {
  id: string
  /** Entreprise (tenant) de l'utilisateur : une seule par utilisateur. */
  companyId: string
  name: string
  role: UserRole
  /** Manager direct ; `null` pour un manager racine, un employé non rattaché ou un RH. */
  managerId: string | null
}

/** Utilisateur, vu par les règles métier : qui il est, où il travaille, à qui il rend compte. */
export class User {
  constructor(private readonly props: UserProps) {}

  get id(): string {
    return this.props.id
  }

  get companyId(): string {
    return this.props.companyId
  }

  get name(): string {
    return this.props.name
  }

  get role(): UserRole {
    return this.props.role
  }

  get managerId(): string | null {
    return this.props.managerId
  }

  hasManager(): boolean {
    return this.props.managerId !== null
  }

  isHrAdmin(): boolean {
    return this.props.role === 'hr_admin'
  }

  worksFor(companyId: string): boolean {
    return this.props.companyId === companyId
  }
}
