import type { ReceiptOcrRequested } from '@/application/messages'
import type { ReceiptSuggestionRepository } from '@/application/ports/ReceiptSuggestionRepository'
import { ReceiptSuggestion, type ReceiptSuggestionStatus } from '@/domain/ReceiptSuggestion'
import { withUserScope } from '@/lib/db'
import { insertOutboxMessages } from './outbox'

interface ReceiptSuggestionRow {
  id: string
  user_id: string
  company_id: string
  status: ReceiptSuggestionStatus
  file_key: string
  content_type: string
  amount: string | null
  expense_date: string | null
  created_at: Date
  completed_at: Date | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function toSuggestion(row: ReceiptSuggestionRow): ReceiptSuggestion {
  return new ReceiptSuggestion({
    id: row.id,
    requesterId: row.user_id,
    companyId: row.company_id,
    status: row.status,
    fileKey: row.file_key,
    contentType: row.content_type,
    fields: {
      ...(row.amount !== null && { amount: Number(row.amount) }),
      ...(row.expense_date !== null && { expenseDate: row.expense_date }),
    },
    createdAt: new Date(row.created_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
  })
}

/** Demandes d'analyse OCR dans Postgres ; chacun ne voit que les siennes (RLS). */
export class PostgresReceiptSuggestionRepository implements ReceiptSuggestionRepository {
  async add(suggestion: ReceiptSuggestion, actorId: string, job: ReceiptOcrRequested): Promise<void> {
    await withUserScope(actorId, async (client) => {
      await client.query(
        `INSERT INTO receipt_suggestions (id, user_id, company_id, status, file_key, content_type, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          suggestion.id,
          suggestion.requesterId,
          suggestion.companyId,
          suggestion.status,
          suggestion.fileKey,
          suggestion.contentType,
          suggestion.createdAt,
        ]
      )
      await insertOutboxMessages(client, [job])
    })
  }

  async findById(suggestionId: string, actorId: string): Promise<ReceiptSuggestion | null> {
    if (!UUID.test(suggestionId)) return null
    return withUserScope(actorId, async (client) => {
      const result = await client.query<ReceiptSuggestionRow>('SELECT * FROM receipt_suggestions WHERE id = $1', [
        suggestionId,
      ])
      return result.rows[0] ? toSuggestion(result.rows[0]) : null
    })
  }

  async saveResult(suggestion: ReceiptSuggestion, actorId: string): Promise<boolean> {
    return withUserScope(actorId, async (client) => {
      const result = await client.query(
        `UPDATE receipt_suggestions
         SET status = $2, amount = $3, expense_date = $4, completed_at = $5
         WHERE id = $1 AND status = 'pending'`,
        [
          suggestion.id,
          suggestion.status,
          suggestion.fields.amount ?? null,
          suggestion.fields.expenseDate ?? null,
          suggestion.completedAt,
        ]
      )
      return (result.rowCount ?? 0) > 0
    })
  }
}
