import { describe, expect, it } from 'vitest'
import { formatCurrency, formatDate, formatDateTime, truncate } from '@/utils/format'

// Seul formatage des montants et des dates affichés (ARC-09).
// Intl utilise des espaces insécables : on les normalise pour comparer.
const plain = (value: string) => value.replace(/\s/g, ' ')

describe('format', () => {
  it('formate un montant en euros, à la française', () => {
    expect(plain(formatCurrency(1234.5))).toBe('1 234,50 €')
  })

  it('formate une date et une date-heure', () => {
    expect(formatDate('2026-10-26')).toBe('26 oct. 2026')
    expect(plain(formatDateTime(new Date(2026, 9, 26, 14, 5)))).toBe('26 oct. 2026, 14:05')
  })

  it('tronque une chaîne trop longue avec une ellipse', () => {
    expect(truncate('court')).toBe('court')
    expect(truncate('abcdefghij', 5)).toBe('abcd…')
  })
})
