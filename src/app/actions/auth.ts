'use server'

import bcrypt from 'bcryptjs'
import { AuthError } from 'next-auth'
import { normalizeEmail } from '@/domain/Email'
import { EmailAlreadyRegisteredError, registerUser } from '@/infrastructure/postgres/accounts'
import { signIn, signOut } from '@/lib/auth'

export interface AuthFormState {
  error?: string
}

const MIN_PASSWORD_LENGTH = 8
const EMAIL_PATTERN = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/

export async function signup(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const name = formData.get('name')
  const rawEmail = formData.get('email')
  const password = formData.get('password')

  const email = typeof rawEmail === 'string' ? normalizeEmail(rawEmail) : null
  const emailMatch = email ? EMAIL_PATTERN.exec(email) : null
  if (
    typeof name !== 'string' ||
    name.trim().length === 0 ||
    !email ||
    !emailMatch ||
    typeof password !== 'string' ||
    password.length < MIN_PASSWORD_LENGTH
  ) {
    return {
      error: `Nom requis, email invalide, ou mot de passe trop court (${MIN_PASSWORD_LENGTH} caractères minimum).`,
    }
  }

  // Entreprise déduite du domaine, compte et entreprise créés en une seule
  // transaction (`app_register_user`, migration 0004).
  const passwordHash = await bcrypt.hash(password, 12)
  try {
    await registerUser({ name: name.trim(), email, passwordHash })
  } catch (error) {
    if (error instanceof EmailAlreadyRegisteredError) return { error: error.message }
    throw error
  }

  try {
    await signIn('credentials', { email, password, redirectTo: '/expenses' })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Le compte a été créé mais la connexion automatique a échoué.' }
    }
    throw error
  }
  return {}
}

export async function login(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = formData.get('email')
  const password = formData.get('password')

  if (typeof email !== 'string' || typeof password !== 'string') {
    return { error: 'Champs invalides.' }
  }

  try {
    await signIn('credentials', { email, password, redirectTo: '/expenses' })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Email ou mot de passe incorrect.' }
    }
    throw error
  }
  return {}
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: '/login' })
}
