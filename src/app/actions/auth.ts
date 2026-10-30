'use server'

import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { AuthError, CredentialsSignin } from 'next-auth'
import { headers } from 'next/headers'
import { isProfessionalEmail, isValidEmail, normalizeEmail } from '@/domain/Email'
import {
  consumeAuthAttempt,
  EmailAlreadyRegisteredError,
  registerUser,
} from '@/infrastructure/postgres/accounts'
import { LOGIN_ERROR_MESSAGES, SIGNUP_RATE_LIMIT } from '@/interface/auth/credentials'
import { signIn, signOut } from '@/lib/auth'
import { emailFingerprint, logSecurityEvent } from '@/lib/logger'
import { appMetrics } from '@/lib/telemetry'

export interface AuthFormState {
  error?: string
  /** Message de succès (inscription : « vérifie ta boîte mail »). */
  notice?: string
}

const MIN_PASSWORD_LENGTH = 8

/**
 * Inscription (ADR 0009). L'entreprise reste déduite du domaine de l'email,
 * mais :
 * - les messageries grand public sont refusées (S7) ;
 * - le compte reste inactif tant que l'adresse n'est pas confirmée (lien
 *   envoyé via l'outbox) : plus de connexion automatique ;
 * - 5 inscriptions par heure et par IP au plus.
 */
export async function signup(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const name = formData.get('name')
  const rawEmail = formData.get('email')
  const password = formData.get('password')

  const email = typeof rawEmail === 'string' ? normalizeEmail(rawEmail) : ''
  if (
    typeof name !== 'string' ||
    name.trim().length === 0 ||
    !isValidEmail(email) ||
    typeof password !== 'string' ||
    password.length < MIN_PASSWORD_LENGTH
  ) {
    return {
      error: `Nom requis, email invalide, ou mot de passe trop court (${MIN_PASSWORD_LENGTH} caractères minimum).`,
    }
  }
  if (!isProfessionalEmail(email)) {
    recordSignup('refused_public_domain', email)
    return { error: 'Utilise ton adresse professionnelle : les messageries grand public ne sont pas acceptées.' }
  }

  const allowed = await consumeAuthAttempt(
    `signup:${await clientIp()}`,
    SIGNUP_RATE_LIMIT.max,
    SIGNUP_RATE_LIMIT.windowSeconds
  )
  if (!allowed) {
    recordSignup('rate_limited', email)
    return { error: 'Trop de tentatives. Réessaie plus tard.' }
  }

  // Compte, entreprise, jeton et message de vérification : une transaction
  // (`app_register_user`, migration 0006).
  const passwordHash = await bcrypt.hash(password, 12)
  try {
    await registerUser({
      name: name.trim(),
      email,
      passwordHash,
      verificationToken: randomBytes(32).toString('base64url'),
    })
  } catch (error) {
    if (error instanceof EmailAlreadyRegisteredError) {
      recordSignup('already_registered', email)
      return { error: error.message }
    }
    throw error
  }
  recordSignup('created', email)
  return { notice: `Compte créé. Un lien de confirmation a été envoyé à ${email} : clique dessus, puis connecte-toi.` }
}

export async function login(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = formData.get('email')
  const password = formData.get('password')

  if (typeof email !== 'string' || typeof password !== 'string') {
    return { error: 'Champs invalides.' }
  }

  try {
    await signIn('credentials', { email, password, redirectTo: '/expenses' })
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      return { error: LOGIN_ERROR_MESSAGES[error.code] ?? LOGIN_ERROR_MESSAGES.invalid_credentials }
    }
    if (error instanceof AuthError) return { error: LOGIN_ERROR_MESSAGES.invalid_credentials }
    throw error
  }
  return {}
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: '/login' })
}

/** IP du client, telle que transmise par le proxy (première de `x-forwarded-for`). */
async function clientIp(): Promise<string> {
  const forwarded = (await headers()).get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || 'unknown'
}

/**
 * Inscription, par résultat (métrique `auth.signups`). Un refus est aussi un
 * événement de sécurité, avec l'empreinte de l'email et jamais l'adresse.
 */
function recordSignup(outcome: string, email: string): void {
  appMetrics().signups.add(1, { outcome })
  if (outcome !== 'created') logSecurityEvent('signup-refused', { reason: outcome, emailHash: emailFingerprint(email) })
}
