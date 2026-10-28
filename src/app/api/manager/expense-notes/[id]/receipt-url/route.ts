import { getReceiptUrl } from '@/composition'
import { auth } from '@/lib/auth'
import { deprecated, legacyErrorResponse, requireRole } from '@/interface/http/legacyRoutes'
import { traced } from '@/interface/http/correlation'

// Déprécié : adaptateur fin vers GetReceiptUrl, remplacé par
// GET /api/expense-notes/{id}/receipt-url (ADR 0004). Codes historiques conservés.
export const GET = traced(async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const successor = `/api/expense-notes/${id}/receipt-url`
  try {
    const guard = requireRole(await auth(), 'manager')
    if (!guard.ok) return deprecated(guard.response, successor)

    const url = await getReceiptUrl.execute({ noteId: id, actorId: guard.actorId })
    return deprecated(Response.json({ url }), successor)
  } catch (error) {
    return deprecated(legacyErrorResponse(error), successor)
  }
})
