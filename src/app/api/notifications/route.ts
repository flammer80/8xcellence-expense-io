import { listMyNotifications } from '@/composition'
import { auth } from '@/lib/auth'
import { problemFromError, unauthenticated } from '@/interface/http/problemDetails'

const INSTANCE = '/api/notifications'

// Contrat : docs/api/openapi.yaml (operationId listMyNotifications), ADR 0007.
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) return unauthenticated(INSTANCE)

    const notifications = await listMyNotifications.execute({ actorId: session.user.id })
    return Response.json(
      notifications.map((n) => ({
        id: n.id,
        noteId: n.noteId,
        noteDescription: n.noteDescription,
        decision: n.decision,
        rejectionReason: n.rejectionReason,
        createdAt: n.createdAt.toISOString(),
      }))
    )
  } catch (error) {
    return problemFromError(error, INSTANCE)
  }
}
