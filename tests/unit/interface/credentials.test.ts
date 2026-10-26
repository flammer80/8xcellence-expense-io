import { describe, expect, it } from 'vitest'
import { authorizeCredentials, type CredentialsDeps } from '@/interface/auth/credentials'

// Connexion (ADR 0009) : limitation des tentatives et compte non vérifié.

function deps(overrides: Partial<CredentialsDeps> = {}, account: { emailVerified?: boolean } = {}) {
  const attempts: string[] = []
  const value: CredentialsDeps = {
    findCredentialsByEmail: async (email) =>
      email === 'alice@acme.fr'
        ? { id: 'u1', email, passwordHash: 'hash:secret', role: 'employee', emailVerified: account.emailVerified ?? true }
        : null,
    consumeAuthAttempt: async (key) => {
      attempts.push(key)
      return true
    },
    comparePassword: async (password, hash) => hash === `hash:${password}`,
    ...overrides,
  }
  return { value, attempts }
}

describe('authorizeCredentials', () => {
  it('connecte un compte vérifié avec le bon mot de passe (email normalisé)', async () => {
    const { value, attempts } = deps()
    expect(await authorizeCredentials({ email: ' Alice@ACME.fr', password: 'secret' }, value)).toEqual({
      ok: true,
      user: { id: 'u1', email: 'alice@acme.fr', role: 'employee' },
    })
    expect(attempts).toEqual(['login:alice@acme.fr'])
  })

  it('même refus pour un email inconnu et un mauvais mot de passe (pas d’énumération)', async () => {
    const { value } = deps()
    const unknown = await authorizeCredentials({ email: 'bob@acme.fr', password: 'secret' }, value)
    const wrong = await authorizeCredentials({ email: 'alice@acme.fr', password: 'nope' }, value)
    expect(unknown).toEqual({ ok: false, reason: 'invalid_credentials' })
    expect(wrong).toEqual(unknown)
  })

  it('refuse au-delà de la limite, même avec le bon mot de passe, sans lire le compte', async () => {
    let lookedUp = false
    const { value } = deps({
      consumeAuthAttempt: async () => false,
      findCredentialsByEmail: async () => {
        lookedUp = true
        return null
      },
    })
    expect(await authorizeCredentials({ email: 'alice@acme.fr', password: 'secret' }, value)).toEqual({
      ok: false,
      reason: 'rate_limited',
    })
    expect(lookedUp).toBe(false)
  })

  it('signale l’email non vérifié seulement après un mot de passe correct', async () => {
    const { value } = deps({}, { emailVerified: false })
    expect(await authorizeCredentials({ email: 'alice@acme.fr', password: 'nope' }, value)).toMatchObject({
      reason: 'invalid_credentials',
    })
    expect(await authorizeCredentials({ email: 'alice@acme.fr', password: 'secret' }, value)).toMatchObject({
      reason: 'email_not_verified',
    })
  })

  it('refuse des champs absents ou non textuels', async () => {
    const { value, attempts } = deps()
    expect(await authorizeCredentials({ email: undefined, password: 'x' }, value)).toMatchObject({ ok: false })
    expect(attempts).toEqual([])
  })
})
