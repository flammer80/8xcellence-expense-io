import { describe, expect, it } from 'vitest'
import {
  EmailAlreadyRegisteredError,
  findCredentialsByEmail,
  registerUser,
} from '@/infrastructure/postgres/accounts'
import { ownerPool } from '../helpers/owner-pool'

// Login et inscription, les deux accès avant authentification : ils passent
// par des fonctions SQL `SECURITY DEFINER`, exécutées ici avec le rôle
// applicatif (ADR 0005).

describe('registerUser', () => {
  it("crée l'entreprise au premier inscrit (RH), puis rattache les suivants (employés)", async () => {
    const first = await registerUser({ name: 'Alice', email: 'alice@acme.fr', passwordHash: 'h1' })
    const second = await registerUser({ name: 'Bob', email: 'bob@acme.fr', passwordHash: 'h2' })

    expect(first.role).toBe('hr_admin')
    expect(second.role).toBe('employee')
    const companies = await ownerPool().query(
      'SELECT DISTINCT company_id FROM users WHERE id = ANY($1::uuid[])',
      [[first.id, second.id]]
    )
    expect(companies.rowCount).toBe(1)
  })

  it('refuse un email déjà pris, même avec une autre casse, sans rien créer', async () => {
    await registerUser({ name: 'Alice', email: 'alice@acme.fr', passwordHash: 'h1' })

    await expect(
      registerUser({ name: 'Alice bis', email: 'ALICE@acme.fr', passwordHash: 'h2' })
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError)
    const users = await ownerPool().query('SELECT id FROM users')
    expect(users.rowCount).toBe(1)
  })
})

describe('findCredentialsByEmail', () => {
  it('retrouve le compte quelle que soit la casse, avec son hash', async () => {
    const { id } = await registerUser({ name: 'Alice', email: 'alice@acme.fr', passwordHash: 'hash' })

    expect(await findCredentialsByEmail('Alice@ACME.fr')).toEqual({
      id,
      email: 'alice@acme.fr',
      passwordHash: 'hash',
      role: 'hr_admin',
    })
  })

  it('renvoie null pour un email inconnu', async () => {
    expect(await findCredentialsByEmail('personne@acme.fr')).toBeNull()
  })
})
