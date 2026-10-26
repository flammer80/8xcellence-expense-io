import { describe, expect, it } from 'vitest'
import { toExpenseNoteDto } from '@/interface/http/mappers'
import { parseExpenseNoteSortParam } from '@/interface/http/expenseNoteSortParam'
import { anExpenseNote } from '../../helpers/builders'

describe('parseExpenseNoteSortParam', () => {
  it('laisse le tri par défaut au cas d’usage quand le paramètre est absent', () => {
    expect(parseExpenseNoteSortParam(null)).toBeUndefined()
    expect(parseExpenseNoteSortParam('')).toBeUndefined()
  })

  it.each([
    ['created_at', { field: 'createdAt', direction: 'asc' }],
    ['amount DESC', { field: 'amount', direction: 'desc' }],
    ['  Expense_Date asc ', { field: 'expenseDate', direction: 'asc' }],
    ['STATUS desc', { field: 'status', direction: 'desc' }],
  ])('traduit %j en tri du domaine', (param, expected) => {
    expect(parseExpenseNoteSortParam(param)).toEqual(expected)
  })

  it.each(['password_hash', 'amount; DROP TABLE users', '(SELECT 1/0)', 'amount sideways', 'user_id'])(
    'refuse %j (SEC-01)',
    (param) => {
      expect(parseExpenseNoteSortParam(param)).toBeNull()
    }
  )
})

describe('toExpenseNoteDto', () => {
  it('expose la note sans aucun détail de stockage (plus de `receiptKey`, ADR 0008)', () => {
    const note = anExpenseNote({
      id: 'n1',
      userId: 'u1',
      amount: 12.3,
      expenseDate: '2026-10-01',
      createdAt: '2026-10-02T08:00:00.000Z',
    })

    expect(toExpenseNoteDto(note)).toEqual({
      id: 'n1',
      userId: 'u1',
      amount: 12.3,
      expenseDate: '2026-10-01',
      description: note.description,
      status: 'pending',
      createdAt: '2026-10-02T08:00:00.000Z',
    })
  })
})
