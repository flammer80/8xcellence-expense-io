import { listCompanyUsers } from '@/composition'
import { auth } from '@/lib/auth'
import { toCompanyUserDto } from '@/interface/http/mappers'
import { deprecated, legacyErrorResponse, requireRole } from '@/interface/http/legacyRoutes'

const SUCCESSOR = '/api/users'

// Déprécié : adaptateur fin vers ListCompanyUsers, remplacé par GET /api/users
// (ADR 0008). Codes et format historiques conservés (403 hors RH, `{ error }`).
export async function GET() {
  try {
    const guard = requireRole(await auth(), 'hr_admin')
    if (!guard.ok) return deprecated(guard.response, SUCCESSOR)

    const users = await listCompanyUsers.execute({ actorId: guard.actorId })
    return deprecated(Response.json(users.map(toCompanyUserDto)), SUCCESSOR)
  } catch (error) {
    return deprecated(legacyErrorResponse(error), SUCCESSOR)
  }
}
