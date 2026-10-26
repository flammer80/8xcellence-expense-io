import { decideExpenseNote } from '@/composition'
import { auth } from '@/lib/auth'
import { toExpenseNoteDto } from '@/interface/http/expenseNoteDto'
import { deprecated, legacyErrorResponse, requireRole } from '@/interface/http/legacyRoutes'
import { traced } from '@/interface/http/correlation'

// Déprécié : adaptateur fin vers DecideExpenseNote, remplacé par
// POST /api/expense-notes/{id}/decision (ADR 0004). Codes historiques conservés.
export const POST = traced(async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const successor = `/api/expense-notes/${id}/decision`
  try {
    const guard = requireRole(await auth(), 'hr_admin')
    if (!guard.ok) return deprecated(guard.response, successor)

    const note = await decideExpenseNote.execute({ noteId: id, actorId: guard.actorId, decision: 'approved' })
    return deprecated(Response.json(toExpenseNoteDto(note)), successor)
  } catch (error) {
    return deprecated(legacyErrorResponse(error), successor)
  }
})
