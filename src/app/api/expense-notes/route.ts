import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { respondError } from '@/lib/errors'
import { listMyExpenseNotes, submitExpenseNote } from '@/composition'
import { InvalidInputError } from '@/domain/errors'
import { toExpenseNoteDto } from '@/interface/http/expenseNoteDto'
import { parseExpenseNoteSortParam } from '@/interface/http/expenseNoteSortParam'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sort = parseExpenseNoteSortParam(new URL(request.url).searchParams.get('sort'))
    if (sort === null) {
      return Response.json({ error: 'Invalid sort' }, { status: 400 })
    }

    const notes = await listMyExpenseNotes.execute({ actorId: session.user.id, sort })
    return Response.json(notes.map(toExpenseNoteDto))
  } catch (error) {
    return respondError(error)
  }
}

// Messages historiques de la route (contrat `{ error }`, conservé jusqu'au
// passage à RFC 9457 à l'étape 6) : un par motif de refus du reçu, un seul
// pour tous les autres champs.
const ERROR_BY_INVALID_FIELD: Record<string, string> = {
  'receipt.type': 'Type de fichier non autorisé pour le reçu',
  'receipt.size': 'Fichier trop volumineux',
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const amount = formData.get('amount')
    const expenseDate = formData.get('expenseDate')
    const description = formData.get('description')
    const receipt = formData.get('receipt')
    if (
      typeof amount !== 'string' ||
      typeof expenseDate !== 'string' ||
      typeof description !== 'string' ||
      !(receipt instanceof File)
    ) {
      return Response.json({ error: 'Champs invalides' }, { status: 400 })
    }

    const note = await submitExpenseNote.execute({
      actorId: session.user.id,
      amount: Number.parseFloat(amount),
      expenseDate,
      description,
      receipt: { bytes: Buffer.from(await receipt.arrayBuffer()), declaredType: receipt.type },
    })

    return Response.json(toExpenseNoteDto(note), {
      status: 201,
      headers: { Location: `/api/expense-notes/${note.id}` },
    })
  } catch (error) {
    if (error instanceof InvalidInputError) {
      return Response.json({ error: ERROR_BY_INVALID_FIELD[error.field] ?? 'Champs invalides' }, { status: 400 })
    }
    return respondError(error)
  }
}
