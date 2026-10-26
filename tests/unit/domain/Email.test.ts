import { describe, expect, it } from 'vitest'
import { normalizeEmail } from '@/domain/Email'

describe('normalizeEmail', () => {
  it('retire les espaces et passe en minuscules', () => {
    expect(normalizeEmail('  Alice.Martin@ACME.fr ')).toBe('alice.martin@acme.fr')
  })
})
