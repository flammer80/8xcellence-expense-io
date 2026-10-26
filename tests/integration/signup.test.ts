import { describe, expect, it, vi } from 'vitest'
import { signup } from '@/app/actions/auth'
import { findCredentialsByEmail } from '@/infrastructure/postgres/accounts'
import { ownerPool } from '../helpers/owner-pool'

// Action d'inscription (ADR 0009), avec la vraie base et le rôle applicatif.

const forwardedFor = { value: '10.0.0.1' }
// L'action importe next-auth pour la connexion ; inutile ici (et non chargeable hors Next).
vi.mock('next-auth', () => ({ AuthError: class extends Error {}, CredentialsSignin: class extends Error {} }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': forwardedFor.value }),
}))

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  Object.entries({ name: 'Alice', email: 'alice@acme.fr', password: 'motdepasse', ...fields }).forEach(([k, v]) =>
    data.set(k, v)
  )
  return data
}

describe('signup', () => {
  it('crée un compte non vérifié, sans connexion automatique, et demande l’envoi du lien', async () => {
    forwardedFor.value = '10.0.0.1'
    const state = await signup({}, form({}))

    expect(state).toEqual({ notice: expect.stringContaining('alice@acme.fr') })
    expect(await findCredentialsByEmail('alice@acme.fr')).toMatchObject({ role: 'hr_admin', emailVerified: false })
    const outbox = await ownerPool().query("SELECT 1 FROM outbox WHERE type = 'EmailVerificationRequested'")
    expect(outbox.rowCount).toBe(1)
  })

  it('refuse une messagerie grand public, sans rien créer (SEC-06)', async () => {
    forwardedFor.value = '10.0.0.2'
    const state = await signup({}, form({ email: 'alice@gmail.com' }))

    expect(state.error).toMatch(/professionnelle/)
    expect((await ownerPool().query('SELECT 1 FROM users')).rowCount).toBe(0)
  })

  it('limite à 5 inscriptions par heure et par IP (SEC-11)', async () => {
    forwardedFor.value = '10.0.0.3'
    for (let i = 0; i < 5; i++) {
      expect((await signup({}, form({ email: `user${i}@acme.fr` }))).notice).toBeDefined()
    }
    expect(await signup({}, form({ email: 'user5@acme.fr' }))).toEqual({ error: expect.stringMatching(/Trop de tentatives/) })

    forwardedFor.value = '10.0.0.4'
    expect((await signup({}, form({ email: 'user6@acme.fr' }))).notice).toBeDefined()
  })
})
