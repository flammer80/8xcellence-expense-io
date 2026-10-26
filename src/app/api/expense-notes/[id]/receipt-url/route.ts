import { getReceiptUrl } from '@/composition'
import { auth } from '@/lib/auth'
import { legacyErrorResponse } from '@/interface/http/legacyRoutes'

// Route unique des reçus : auteur ou validateur désigné (GetReceiptUrl).
// Format historique `{ url }` / `{ error }` conservé (docs/api/openapi.yaml).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params

    const url = await getReceiptUrl.execute({ noteId: id, actorId: session.user.id })
    return Response.json({ url })
  } catch (error) {
    return legacyErrorResponse(error)
  }
}
