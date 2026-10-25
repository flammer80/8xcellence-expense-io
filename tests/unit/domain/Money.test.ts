import { describe, expect, it } from 'vitest'
import { InvalidInputError } from '@/domain/errors'
import { Money } from '@/domain/Money'

describe('Money', () => {
  it('lit la chaîne renvoyée par Postgres pour un numeric(10, 2)', () => {
    expect(Money.fromDecimal('12.30').toDecimal()).toBe(12.3)
    expect(Money.fromDecimal('12.30').inCents).toBe(1230)
  })

  it("ne cumule pas d'erreur d'arrondi des flottants", () => {
    expect(Money.fromDecimal(0.1).inCents + Money.fromDecimal(0.2).inCents).toBe(30)
  })

  it.each([
    ['NaN', Number.NaN],
    ['infini', Number.POSITIVE_INFINITY],
    ['texte', 'douze'],
    ['négatif', -1],
    ['trois décimales', 1.005],
  ])('refuse un montant invalide (%s)', (_label, value) => {
    expect(() => Money.fromDecimal(value)).toThrow(InvalidInputError)
  })

  it('compare deux montants', () => {
    expect(Money.fromDecimal(5).compareTo(Money.fromDecimal(10))).toBeLessThan(0)
    expect(Money.fromDecimal('10.00').equals(Money.fromDecimal(10))).toBe(true)
  })

  it('distingue un montant nul d’un montant positif', () => {
    expect(Money.fromDecimal(0).isPositive()).toBe(false)
    expect(Money.fromDecimal(0.01).isPositive()).toBe(true)
  })
})
