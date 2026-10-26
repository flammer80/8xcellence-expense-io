import { assignManager } from '@/composition'
import { auth } from '@/lib/auth'
import { traced } from '@/interface/http/correlation'
import { toCompanyUserDto } from '@/interface/http/mappers'
import { invalidRequest, problemFromError, unauthenticated } from '@/interface/http/problemDetails'
import { assignManagerRequestSchema, parseWith } from '@/interface/http/schemas'

// Contrat : docs/api/openapi.yaml (operationId assignManager), ADR 0008.
// PUT : le rattachement est remplacé, rejouer la requête donne le même état.
export const PUT = traced(async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const instance = `/api/users/${id}/manager`
  try {
    const session = await auth()
    if (!session?.user) return unauthenticated(instance)

    const parsed = parseWith(assignManagerRequestSchema, await request.json().catch(() => null))
    if (!parsed.ok) return invalidRequest(instance, parsed.errors)

    const user = await assignManager.execute({ actorId: session.user.id, userId: id, ...parsed.value })
    return Response.json(toCompanyUserDto(user))
  } catch (error) {
    return problemFromError(error, instance)
  }
})
