import { listPendingApprovals } from '@/composition'
import { auth } from '@/lib/auth'
import { respondError } from '@/lib/errors'
import { toPendingApprovalDto } from '@/interface/http/mappers'
import { deprecated, requireRole } from '@/interface/http/legacyRoutes'
import { traced } from '@/interface/http/correlation'

const SUCCESSOR = '/api/expense-notes/pending'

// Déprécié : file de validation du RH, remplacée par
// GET /api/expense-notes/pending (ADR 0008). Même cas d'usage
// (ListPendingApprovals, filtré par l'ApprovalPolicy), codes historiques.
export const GET = traced(async function GET() {
  try {
    const guard = requireRole(await auth(), 'hr_admin')
    if (!guard.ok) return deprecated(guard.response, SUCCESSOR)

    const pending = await listPendingApprovals.execute({ actorId: guard.actorId })
    return deprecated(Response.json(pending.map(toPendingApprovalDto)), SUCCESSOR)
  } catch (error) {
    return deprecated(respondError(error), SUCCESSOR)
  }
})
