import { listPendingApprovals } from '@/composition'
import { auth } from '@/lib/auth'
import { respondError } from '@/lib/errors'
import { toExpenseNoteDto } from '@/interface/http/expenseNoteDto'
import { requireRole } from '@/interface/http/legacyRoutes'

// File d'attente du manager : notes en attente que l'utilisateur peut trancher,
// les plus anciennes d'abord (ListPendingApprovals, filtrée par l'ApprovalPolicy).
export async function GET() {
  try {
    const guard = requireRole(await auth(), 'manager')
    if (!guard.ok) return guard.response

    const notes = await listPendingApprovals.execute({ actorId: guard.actorId })
    return Response.json(notes.map(toExpenseNoteDto))
  } catch (error) {
    return respondError(error)
  }
}
