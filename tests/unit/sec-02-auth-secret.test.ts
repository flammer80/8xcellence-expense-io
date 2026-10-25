import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { encode } from 'next-auth/jwt'

// SEC-02 (audit v2) : le secret de signature des sessions était écrit en dur
// dans src/lib/auth.ts (donc public), et l'AUTH_SECRET de l'environnement
// était ignoré.

const LEAKED_SECRET = 'e29f9c3b6a1d4e7f8021c5b6d4a9f0e3c7b8a2d1f6e5c4b3a2918273645fabcd'
const ENV_SECRET = 'test-only-secret-0123456789abcdef0123456789abcdef'
const COOKIE_NAME = 'authjs.session-token'

type SessionHandler = (request: NextRequest, context: unknown) => Promise<Response>

async function forgeSessionCookie(secret: string): Promise<string> {
  const token = await encode({
    token: { sub: 'forged-user', id: 'forged-user', role: 'hr_admin' },
    secret,
    salt: COOKIE_NAME,
  })
  return `${COOKIE_NAME}=${token}`
}

/** Renvoie la session que NextAuth reconstruit à partir du cookie donné. */
async function sessionFor(cookie: string) {
  const { auth } = await import('@/lib/auth')
  const handler = auth((req) => Response.json({ session: req.auth })) as unknown as SessionHandler
  // `host` et `x-forwarded-proto` sont posés par Next.js sur toute vraie
  // requête ; sans eux, NextAuth suppose HTTPS et cherche un cookie `__Secure-`.
  const headers = { cookie, host: 'localhost:3000', 'x-forwarded-proto': 'http' }
  const response = await handler(new NextRequest('http://localhost:3000/hr', { headers }), {
    params: Promise.resolve({}),
  })
  const body = (await response.json()) as { session: { user?: { role?: string } } | null }
  return body.session
}

describe('SEC-02 — secret de session', () => {
  const originalSecret = process.env.AUTH_SECRET

  beforeEach(() => {
    vi.resetModules()
    process.env.AUTH_SECRET = ENV_SECRET
  })

  afterEach(() => {
    process.env.AUTH_SECRET = originalSecret
  })

  it('rejette une session forgée avec le secret publié dans le dépôt', async () => {
    const session = await sessionFor(await forgeSessionCookie(LEAKED_SECRET))
    expect(session).toBeNull()
  })

  it("accepte une session signée avec l'AUTH_SECRET de l'environnement", async () => {
    const session = await sessionFor(await forgeSessionCookie(ENV_SECRET))
    expect(session?.user?.role).toBe('hr_admin')
  })

  it('refuse de démarrer sans AUTH_SECRET', async () => {
    delete process.env.AUTH_SECRET
    await expect(import('@/lib/auth')).rejects.toThrow(/AUTH_SECRET/)
  })

  it.each([
    ['la valeur d’exemple de .env.example', 'changeme-generate-a-real-secret-for-non-local-use'],
    ['l’ancien secret publié', LEAKED_SECRET],
  ])('refuse de démarrer avec %s', async (_label, secret) => {
    process.env.AUTH_SECRET = secret
    await expect(import('@/lib/auth')).rejects.toThrow(/AUTH_SECRET/)
  })
})
