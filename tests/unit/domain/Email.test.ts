import { describe, expect, it } from 'vitest'
import { emailDomain, isProfessionalEmail, isValidEmail, normalizeEmail } from '@/domain/Email'

describe('normalizeEmail', () => {
  it('retire les espaces et passe en minuscules', () => {
    expect(normalizeEmail('  Alice.Martin@ACME.fr ')).toBe('alice.martin@acme.fr')
  })
})

describe('email professionnel (ADR 0009)', () => {
  it.each(['alice@acme.fr', 'bob@sub.acme.co.uk'])('accepte %s', (email) => {
    expect(isProfessionalEmail(email)).toBe(true)
  })

  it.each(['alice@gmail.com', 'bob@outlook.fr', 'carol@yahoo.fr', 'pas-un-email', 'x@localhost'])(
    'refuse %s (messagerie grand public ou adresse invalide, S7)',
    (email) => {
      expect(isProfessionalEmail(email)).toBe(false)
    }
  )

  it('extrait le domaine en minuscules', () => {
    expect(emailDomain('alice@ACME.fr')).toBe('acme.fr')
    expect(isValidEmail('alice@acme.fr')).toBe(true)
  })
})
