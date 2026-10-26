import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { listMyExpenseNotes, submitExpenseNote } from '@/composition'
import { toExpenseNoteDto } from '@/interface/http/mappers'
import { parseExpenseNoteSortParam } from '@/interface/http/expenseNoteSortParam'
import { traced } from '@/interface/http/correlation'
import { invalidRequest, legacyCompatibleProblem, unauthenticated } from '@/interface/http/problemDetails'
import { expenseNoteFormSchema, formFields, parseWith } from '@/interface/http/schemas'

const INSTANCE = '/api/expense-notes'

// Contrat : docs/api/openapi.yaml (operationIds listMyExpenseNotes,
// submitExpenseNote). Erreurs RFC 9457 avec le membre historique `error` et
// les codes d'origine (ADR 0008).

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return unauthenticated(INSTANCE, { error: 'Unauthorized' })

    const sort = parseExpenseNoteSortParam(new URL(request.url).searchParams.get('sort'))
    if (sort === null) {
      return invalidRequest(
        INSTANCE,
        [{ pointer: '#/sort', detail: '<colonne> [ASC|DESC] parmi created_at, expense_date, amount, status' }],
        { error: 'Invalid sort' }
      )
    }

    const notes = await listMyExpenseNotes.execute({ actorId: session.user.id, sort })
    return Response.json(notes.map(toExpenseNoteDto))
  } catch (error) {
    return legacyCompatibleProblem(error, INSTANCE)
  }
}

export const POST = traced(async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return unauthenticated(INSTANCE, { error: 'Unauthorized' })

    const parsed = parseWith(expenseNoteFormSchema, formFields(await request.formData()))
    if (!parsed.ok) return invalidRequest(INSTANCE, parsed.errors, { error: 'Champs invalides' })
    const { amount, expenseDate, description, receipt } = parsed.value

    const note = await submitExpenseNote.execute({
      actorId: session.user.id,
      amount,
      expenseDate,
      description,
      receipt: { bytes: Buffer.from(await receipt.arrayBuffer()), declaredType: receipt.type },
    })

    return Response.json(toExpenseNoteDto(note), {
      status: 201,
      headers: { Location: `/api/expense-notes/${note.id}` },
    })
  } catch (error) {
    return legacyCompatibleProblem(error, INSTANCE)
  }
})
