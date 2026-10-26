import { listPendingApprovals } from '@/composition'
import { auth } from '@/lib/auth'
import { respondError } from '@/lib/errors'
import { toPendingApprovalDto } from '@/interface/http/mappers'
import { deprecated, requireRole } from '@/interface/http/legacyRoutes'

const SUCCESSOR = '/api/expense-notes/pending'

// Déprécié : file de validation du manager, remplacée par
// GET /api/expense-notes/pending (ADR 0008). Même cas d'usage
// (ListPendingApprovals, filtré par l'ApprovalPolicy), codes historiques.
export async function GET() {
  try {
    const guard = requireRole(await auth(), 'manager')
    if (!guard.ok) return deprecated(guard.response, SUCCESSOR)

    const pending = await listPendingApprovals.execute({ actorId: guard.actorId })
    return deprecated(Response.json(pending.map(toPendingApprovalDto)), SUCCESSOR)
  } catch (error) {
    return deprecated(respondError(error), SUCCESSOR)
  }
}
