import { assignManager } from '@/composition'
import { InvalidInputError } from '@/domain/errors'
import { auth } from '@/lib/auth'
import { traced } from '@/interface/http/correlation'
import { toCompanyUserDto } from '@/interface/http/mappers'
import { deprecated, legacyErrorResponse, requireRole } from '@/interface/http/legacyRoutes'
import { assignManagerRequestSchema, parseWith } from '@/interface/http/schemas'

// Déprécié : adaptateur fin vers AssignManager, remplacé par
// PUT /api/users/{id}/manager (ADR 0008). Codes historiques conservés :
// 403 hors RH, 404 cible introuvable, 409 `Invalid manager` (autre entreprise,
// soi-même ou cycle — SEC-05). Un corps illisible répond 400 au lieu de
// détacher l'utilisateur en silence (SEC-10).
export const PUT = traced(async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const successor = `/api/users/${id}/manager`
  try {
    const guard = requireRole(await auth(), 'hr_admin')
    if (!guard.ok) return deprecated(guard.response, successor)

    const parsed = parseWith(assignManagerRequestSchema, await request.json().catch(() => null))
    if (!parsed.ok) return deprecated(Response.json({ error: 'Invalid body' }, { status: 400 }), successor)

    const user = await assignManager.execute({ actorId: guard.actorId, userId: id, ...parsed.value })
    return deprecated(Response.json(toCompanyUserDto(user)), successor)
  } catch (error) {
    if (error instanceof InvalidInputError) {
      return deprecated(Response.json({ error: 'Invalid manager' }, { status: 409 }), successor)
    }
    return deprecated(legacyErrorResponse(error), successor)
  }
})
