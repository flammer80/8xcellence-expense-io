import { getReceiptSuggestion } from '@/composition'
import { auth } from '@/lib/auth'
import { problemFromError, unauthenticated } from '@/interface/http/problemDetails'
import { receiptSuggestionPath, toReceiptSuggestionDto } from '@/interface/http/mappers'
import { traced } from '@/interface/http/correlation'

// Contrat : docs/api/openapi.yaml (operationId getReceiptSuggestion), ADR 0007.
// Polling : 200 à chaque appel ; le client s'arrête sur `done` ou `failed`.
export const GET = traced(async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const instance = receiptSuggestionPath(id)
  try {
    const session = await auth()
    if (!session?.user) return unauthenticated(instance)

    const suggestion = await getReceiptSuggestion.execute({ suggestionId: id, actorId: session.user.id })
    const headers: HeadersInit = suggestion.isPending() ? { 'Retry-After': '1' } : {}
    return Response.json(toReceiptSuggestionDto(suggestion), { headers })
  } catch (error) {
    return problemFromError(error, instance)
  }
})
