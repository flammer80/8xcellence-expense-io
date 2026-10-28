import { listPendingApprovals } from '@/composition'
import { auth } from '@/lib/auth'
import { toPendingApprovalDto } from '@/interface/http/mappers'
import { problemFromError, unauthenticated } from '@/interface/http/problemDetails'
import { traced } from '@/interface/http/correlation'

const INSTANCE = '/api/expense-notes/pending'

// Contrat : docs/api/openapi.yaml (operationId listPendingApprovals), ADR 0008.
// Une seule file de validation pour tous les rôles : l'ApprovalPolicy décide
// de ce que chacun peut trancher (liste vide pour un employé).
export const GET = traced(async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return unauthenticated(INSTANCE)

    const pending = await listPendingApprovals.execute({ actorId: session.user.id })
    return Response.json(pending.map(toPendingApprovalDto))
  } catch (error) {
    return problemFromError(error, INSTANCE)
  }
})
