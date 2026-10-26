import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import type { UserRole } from '@/domain/User'
import { normalizeEmail } from '@/domain/Email'
import { findCredentialsByEmail } from '@/infrastructure/postgres/accounts'

// Valeurs à ne jamais accepter comme secret de signature : celle d'exemple de
// .env.example, et l'ancien secret qui était versionné dans ce fichier
// (public, donc révoqué — SEC-02).
const REVOKED_SECRETS = new Set([
  'changeme-generate-a-real-secret-for-non-local-use',
  'e29f9c3b6a1d4e7f8021c5b6d4a9f0e3c7b8a2d1f6e5c4b3a2918273645fabcd',
])

/**
 * Lit le secret de signature des sessions depuis l'environnement. Refuse de
 * démarrer s'il manque ou s'il est connu publiquement : avec un secret
 * connu, n'importe qui peut forger une session (rôle compris).
 */
function readAuthSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET is not set. Generate one with `npx auth secret` or `make env`.')
  }
  if (REVOKED_SECRETS.has(secret)) {
    throw new Error('AUTH_SECRET uses a public or example value. Generate a new one with `npx auth secret`.')
  }
  return secret
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: readAuthSecret(),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? normalizeEmail(credentials.email) : null
        const password =
          typeof credentials?.password === 'string' ? credentials.password : null
        if (!email || !password) return null

        const user = await findCredentialsByEmail(email)
        if (!user) return null

        const passwordMatches = await bcrypt.compare(password, user.passwordHash)
        if (!passwordMatches) return null

        return { id: user.id, email: user.email, role: user.role }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as UserRole
      }
      return session
    },
  },
})
