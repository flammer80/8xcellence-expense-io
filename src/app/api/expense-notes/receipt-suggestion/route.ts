import { auth } from '@/lib/auth'
import { respondError } from '@/lib/errors'
import { MAX_OCR_BYTES, suggestFields } from '@/lib/ocr'
import { deprecated } from '@/interface/http/legacyRoutes'

const SUCCESSOR = '/api/receipt-suggestions'

// Déprécié : analyse synchrone, remplacée par POST /api/receipt-suggestions
// (202 + polling, ADR 0007). Gardée pour ses consommateurs existants, mais
// bornée : 5 Mo au plus, worker Tesseract partagé, une analyse à la fois
// (SEC-08). Format historique `{ error }` conservé.
export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return deprecated(Response.json({ error: 'Unauthorized' }, { status: 401 }), SUCCESSOR)
    }

    const formData = await request.formData()
    const receipt = formData.get('receipt')
    if (!(receipt instanceof File)) {
      return deprecated(Response.json({ error: 'Champs invalides' }, { status: 400 }), SUCCESSOR)
    }
    if (receipt.size > MAX_OCR_BYTES) {
      return deprecated(Response.json({ error: 'Fichier trop volumineux' }, { status: 413 }), SUCCESSOR)
    }

    const buffer = Buffer.from(await receipt.arrayBuffer())
    const suggestion = await suggestFields({ data: buffer, mimeType: receipt.type })
    return deprecated(Response.json(suggestion), SUCCESSOR)
  } catch (error) {
    return deprecated(respondError(error), SUCCESSOR)
  }
}
