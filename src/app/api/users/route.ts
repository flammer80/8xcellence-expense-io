import { listCompanyUsers } from '@/composition'
import { auth } from '@/lib/auth'
import { toCompanyUserDto } from '@/interface/http/mappers'
import { problemFromError, unauthenticated } from '@/interface/http/problemDetails'
import { traced } from '@/interface/http/correlation'

const INSTANCE = '/api/users'

// Contrat : docs/api/openapi.yaml (operationId listCompanyUsers), ADR 0008.
export const GET = traced(async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return unauthenticated(INSTANCE)

    const users = await listCompanyUsers.execute({ actorId: session.user.id })
    return Response.json(users.map(toCompanyUserDto))
  } catch (error) {
    return problemFromError(error, INSTANCE)
  }
})
