import { describe, expect, it } from 'vitest'
import { InvalidInputError } from '@/domain/errors'
import { ExpenseDate } from '@/domain/ExpenseDate'

describe('ExpenseDate', () => {
  it('accepte un jour du calendrier au format YYYY-MM-DD', () => {
    expect(ExpenseDate.parse('2026-02-28').toString()).toBe('2026-02-28')
    expect(ExpenseDate.parse('2028-02-29').toString()).toBe('2028-02-29')
  })

  it.each(['2026-02-30', '2026-13-01', '2026-2-3', '03/10/2026', '2026-10-01T00:00:00Z', ''])(
    'refuse %j',
    (value) => {
      expect(() => ExpenseDate.parse(value)).toThrow(InvalidInputError)
    }
  )

  it('compare deux dates dans l’ordre chronologique', () => {
    expect(ExpenseDate.parse('2026-01-31').compareTo(ExpenseDate.parse('2026-02-01'))).toBeLessThan(0)
    expect(ExpenseDate.parse('2026-02-01').equals(ExpenseDate.parse('2026-02-01'))).toBe(true)
  })
})
