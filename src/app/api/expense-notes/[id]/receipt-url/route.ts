import { getReceiptUrl } from '@/composition'
import { auth } from '@/lib/auth'
import type { ReceiptUrlDto } from '@/interface/http/dto'
import { legacyCompatibleProblem, unauthenticated } from '@/interface/http/problemDetails'
import { traced } from '@/interface/http/correlation'

// Route unique des reçus : auteur ou validateur désigné (GetReceiptUrl).
// Contrat : docs/api/openapi.yaml (operationId getReceiptUrl). Erreurs RFC
// 9457 avec le membre historique `error` (ADR 0008).
export const GET = traced(async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const instance = `/api/expense-notes/${id}/receipt-url`
  try {
    const session = await auth()
    if (!session?.user) return unauthenticated(instance, { error: 'Unauthorized' })

    const body: ReceiptUrlDto = { url: await getReceiptUrl.execute({ noteId: id, actorId: session.user.id }) }
    return Response.json(body)
  } catch (error) {
    return legacyCompatibleProblem(error, instance)
  }
})
