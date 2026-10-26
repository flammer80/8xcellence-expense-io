import { describe, expect, it } from 'vitest'
import { ReceiptSuggestion } from '@/domain/ReceiptSuggestion'

const AT = new Date('2026-10-26T09:00:00.000Z')

const pending = () =>
  ReceiptSuggestion.request({
    id: 's1',
    requesterId: 'employee',
    companyId: 'acme',
    fileKey: 'ocr/acme/s1.png',
    contentType: 'image/png',
    createdAt: AT,
  })

describe('ReceiptSuggestion', () => {
  it('naît en attente, sans champ reconnu', () => {
    expect(pending()).toMatchObject({ status: 'pending', fields: {}, completedAt: null })
  })

  it('se termine avec les champs reconnus, sans modifier la demande d’origine', () => {
    const original = pending()
    const done = original.complete({ amount: 12.5, expenseDate: '2026-10-20' }, AT)

    expect(done).toMatchObject({ status: 'done', fields: { amount: 12.5, expenseDate: '2026-10-20' }, completedAt: AT })
    expect(original.status).toBe('pending')
  })

  it('peut échouer, et un état final ne change plus', () => {
    const failed = pending().fail(AT)
    expect(failed.status).toBe('failed')
    expect(() => failed.complete({}, AT)).toThrow(/déjà traitée/)
    expect(() => pending().complete({}, AT).fail(AT)).toThrow(/déjà traitée/)
  })
})
