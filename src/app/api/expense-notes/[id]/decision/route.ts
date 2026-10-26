import { decideExpenseNote } from '@/composition'
import { auth } from '@/lib/auth'
import { parseDecisionRequest } from '@/interface/http/decisionRequest'
import { toExpenseNoteDto } from '@/interface/http/expenseNoteDto'
import { invalidRequest, problemFromError, unauthenticated } from '@/interface/http/problemDetails'
import { traced } from '@/interface/http/correlation'

// Contrat : docs/api/openapi.yaml (operationId decideExpenseNote), ADR 0004.
export const POST = traced(async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const instance = `/api/expense-notes/${id}/decision`
  try {
    const session = await auth()
    if (!session?.user) return unauthenticated(instance)

    const parsed = parseDecisionRequest(await request.json().catch(() => null))
    if (!parsed.ok) return invalidRequest(instance, parsed.errors)

    const note = await decideExpenseNote.execute({ noteId: id, actorId: session.user.id, ...parsed.value })
    return Response.json(toExpenseNoteDto(note))
  } catch (error) {
    return problemFromError(error, instance)
  }
})
