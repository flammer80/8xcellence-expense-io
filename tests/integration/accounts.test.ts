import { describe, expect, it } from 'vitest'
import {
  EmailAlreadyRegisteredError,
  findCredentialsByEmail,
  consumeAuthAttempt,
  verifyEmail,
  registerUser,
} from '@/infrastructure/postgres/accounts'
import { ownerPool } from '../helpers/owner-pool'

let tokenSeq = 0
const token = () => `verification-token-${String(++tokenSeq).padStart(16, '0')}`

// Login et inscription, les deux accès avant authentification : ils passent
// par des fonctions SQL `SECURITY DEFINER`, exécutées ici avec le rôle
// applicatif (ADR 0005).

describe('registerUser', () => {
  it("crée l'entreprise au premier inscrit (RH), puis rattache les suivants (employés)", async () => {
    const first = await registerUser({ name: 'Alice', email: 'alice@acme.fr', passwordHash: 'h1', verificationToken: token() })
    const second = await registerUser({ name: 'Bob', email: 'bob@acme.fr', passwordHash: 'h2', verificationToken: token() })

    expect(first.role).toBe('hr_admin')
    expect(second.role).toBe('employee')
    const companies = await ownerPool().query(
      'SELECT DISTINCT company_id FROM users WHERE id = ANY($1::uuid[])',
      [[first.id, second.id]]
    )
    expect(companies.rowCount).toBe(1)
  })

  it('refuse un email déjà pris, même avec une autre casse, sans rien créer', async () => {
    await registerUser({ name: 'Alice', email: 'alice@acme.fr', passwordHash: 'h1', verificationToken: token() })

    await expect(
      registerUser({ name: 'Alice bis', email: 'ALICE@acme.fr', passwordHash: 'h2', verificationToken: token() })
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError)
    const users = await ownerPool().query('SELECT id FROM users')
    expect(users.rowCount).toBe(1)
  })
})

describe('findCredentialsByEmail', () => {
  it('retrouve le compte quelle que soit la casse, avec son hash', async () => {
    const { id } = await registerUser({ name: 'Alice', email: 'alice@acme.fr', passwordHash: 'hash', verificationToken: token() })

    expect(await findCredentialsByEmail('Alice@ACME.fr')).toEqual({
      id,
      email: 'alice@acme.fr',
      passwordHash: 'hash',
      role: 'hr_admin',
      emailVerified: false,
    })
  })

  it('renvoie null pour un email inconnu', async () => {
    expect(await findCredentialsByEmail('personne@acme.fr')).toBeNull()
  })
})

describe('vérification de l’email (ADR 0009)', () => {
  it("dépose le lien dans l'outbox, dans la même transaction que le compte", async () => {
    const verificationToken = token()
    const { id } = await registerUser({ name: 'Alice', email: 'alice@acme.fr', passwordHash: 'h', verificationToken })

    const outbox = await ownerPool().query("SELECT type, version, payload FROM outbox WHERE type = 'EmailVerificationRequested'")
    expect(outbox.rows).toEqual([
      {
        type: 'EmailVerificationRequested',
        version: 1,
        payload: { userId: id, email: 'alice@acme.fr', name: 'Alice', token: verificationToken },
      },
    ])
    const stored = await ownerPool().query('SELECT token_hash FROM email_verifications WHERE user_id = $1', [id])
    expect(stored.rows[0].token_hash).not.toBe(verificationToken)
  })

  it('ne crée ni compte ni message si l’email est déjà pris', async () => {
    await registerUser({ name: 'Alice', email: 'alice@acme.fr', passwordHash: 'h', verificationToken: token() })
    await expect(
      registerUser({ name: 'Alice', email: 'alice@acme.fr', passwordHash: 'h', verificationToken: token() })
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError)
    expect((await ownerPool().query('SELECT 1 FROM outbox')).rowCount).toBe(1)
  })

  it('le bon jeton vérifie le compte ; un jeton inconnu ou expiré, non', async () => {
    const verificationToken = token()
    const { id } = await registerUser({ name: 'Alice', email: 'alice@acme.fr', passwordHash: 'h', verificationToken })

    expect(await verifyEmail('jeton-inconnu')).toBe(false)
    expect(await verifyEmail(verificationToken)).toBe(true)
    expect(await verifyEmail(verificationToken)).toBe(true)
    expect((await findCredentialsByEmail('alice@acme.fr'))?.emailVerified).toBe(true)

    const other = token()
    const bob = await registerUser({ name: 'Bob', email: 'bob@acme.fr', passwordHash: 'h', verificationToken: other })
    await ownerPool().query("UPDATE email_verifications SET expires_at = now() - interval '1 second' WHERE user_id = $1", [bob.id])
    expect(await verifyEmail(other)).toBe(false)
    expect(id).not.toBe(bob.id)
  })
})

describe('consumeAuthAttempt', () => {
  it('autorise jusqu’à la limite, puis refuse, clé par clé', async () => {
    const results = []
    for (let i = 0; i < 4; i++) results.push(await consumeAuthAttempt('login:alice@acme.fr', 3, 60))
    expect(results).toEqual([true, true, true, false])
    expect(await consumeAuthAttempt('login:bob@acme.fr', 3, 60)).toBe(true)
  })

  it('oublie les tentatives sorties de la fenêtre', async () => {
    await consumeAuthAttempt('signup:1.2.3.4', 1, 60)
    await ownerPool().query("UPDATE auth_attempts SET attempted_at = now() - interval '2 minutes'")
    expect(await consumeAuthAttempt('signup:1.2.3.4', 1, 60)).toBe(true)
  })
})
