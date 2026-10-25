import { vi } from 'vitest'
import { auth } from '@/lib/auth'
import type { TestUser } from './factories'

// `auth` est remplacé par un vi.fn() dans integration-setup.ts ; son type
// réel (surchargé middleware/session) ne se prête pas à vi.mocked.
const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>

/** Simule la session NextAuth de l'utilisateur donné. */
export function signInAs(user: Pick<TestUser, 'id' | 'email' | 'role'>): void {
  mockedAuth.mockResolvedValue({
    user: { id: user.id, email: user.email, role: user.role },
    expires: '2999-01-01T00:00:00.000Z',
  })
}

/** Simule un visiteur non connecté. */
export function signOut(): void {
  mockedAuth.mockResolvedValue(null)
}
