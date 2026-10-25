import { auth } from '@/lib/auth'
import { withUserScope } from '@/lib/db'
import { respondError } from '@/lib/errors'
import { getReceiptUrl } from '@/lib/storage'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'manager') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params

    // Le rattachement est revérifié ici : un id de note ne prouve rien sur
    // le droit d'en voir le reçu (SEC-04). Même filtre que approve/reject.
    const note = await withUserScope(session.user.id, async (client) => {
      const result = await client.query(
        `SELECT en.receipt_key FROM expense_notes en
         JOIN users u ON u.id = en.user_id
         WHERE en.id = $1 AND u.manager_id = $2`,
        [id, session.user.id]
      )
      return result.rows[0]
    })
    if (!note) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    const url = await getReceiptUrl(note.receipt_key)
    return Response.json({ url })
  } catch (error) {
    return respondError(error)
  }
}
