import { requestReceiptSuggestion } from '@/composition'
import { auth } from '@/lib/auth'
import { traced } from '@/interface/http/correlation'
import { invalidRequest, problemFromError, unauthenticated } from '@/interface/http/problemDetails'
import { receiptSuggestionPath, toReceiptSuggestionDto } from '@/interface/http/receiptSuggestionDto'

const INSTANCE = '/api/receipt-suggestions'

/** Délai conseillé avant le premier polling, en secondes. */
const POLL_AFTER_SECONDS = 1

// Contrat : docs/api/openapi.yaml (operationId requestReceiptSuggestion), ADR 0007.
// L'analyse se fait en arrière-plan : 202 + `Location`, puis polling.
export const POST = traced(async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) return unauthenticated(INSTANCE)

    const formData = await request.formData().catch(() => null)
    const receipt = formData?.get('receipt')
    if (!(receipt instanceof File)) {
      return invalidRequest(INSTANCE, [{ pointer: '#/receipt', detail: 'fichier requis (multipart/form-data)' }])
    }

    const suggestion = await requestReceiptSuggestion.execute({
      actorId: session.user.id,
      receipt: { bytes: Buffer.from(await receipt.arrayBuffer()), declaredType: receipt.type },
    })
    const location = receiptSuggestionPath(suggestion.id)
    return Response.json(toReceiptSuggestionDto(suggestion), {
      status: 202,
      headers: { Location: location, 'Retry-After': String(POLL_AFTER_SECONDS) },
    })
  } catch (error) {
    return problemFromError(error, INSTANCE)
  }
})
