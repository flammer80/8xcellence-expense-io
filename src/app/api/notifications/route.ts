import { listMyNotifications } from '@/composition'
import { auth } from '@/lib/auth'
import { toNotificationDto } from '@/interface/http/mappers'
import { problemFromError, unauthenticated } from '@/interface/http/problemDetails'

const INSTANCE = '/api/notifications'

// Contrat : docs/api/openapi.yaml (operationId listMyNotifications), ADR 0007.
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return unauthenticated(INSTANCE)

    const notifications = await listMyNotifications.execute({ actorId: session.user.id })
    return Response.json(notifications.map(toNotificationDto))
  } catch (error) {
    return problemFromError(error, INSTANCE)
  }
}
