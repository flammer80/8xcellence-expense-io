import { auth } from '@/lib/auth'
import { withUserScope } from '@/lib/db'
import { respondError } from '@/lib/errors'
import { toExpenseNote } from '@/infrastructure/postgres/expenseNoteRow'
import { toExpenseNoteDto } from '@/interface/http/expenseNoteDto'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'hr_admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }
    const { id } = await params

    return withUserScope(session.user.id, async (client) => {
      const existing = await client.query(
        `SELECT en.* FROM expense_notes en
         JOIN users u ON u.id = en.user_id
         WHERE en.id = $1 AND u.role = 'manager' AND u.manager_id IS NULL
           AND u.company_id = (SELECT company_id FROM users WHERE id = $2)`,
        [id, session.user.id]
      )
      const row = existing.rows[0]
      if (!row) {
        return Response.json({ error: 'Not found' }, { status: 404 })
      }
      if (row.status !== 'pending') {
        return Response.json({ error: 'Already decided' }, { status: 409 })
      }

      const updated = await client.query(
        `UPDATE expense_notes SET status = 'approved' WHERE id = $1 RETURNING *`,
        [id]
      )
      const note = updated.rows[0]
      return Response.json(toExpenseNoteDto(toExpenseNote(note)))
    })
  } catch (error) {
    return respondError(error)
  }
}
