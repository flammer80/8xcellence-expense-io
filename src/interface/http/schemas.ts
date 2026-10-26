import { z } from 'zod'
import type { AssignManagerRequestDto, DecisionRequestDto } from './dto'
import type { ProblemFieldError } from './problemDetails'

// Schémas zod des entrées HTTP : ils valident la **forme** (types, champs
// connus). Les règles métier (montant positif, motif réservé au rejet,
// cycle hiérarchique…) restent dans le domaine et donnent un 422.

export const decisionRequestSchema = z
  .object({
    decision: z.enum(['approved', 'rejected'], { message: 'doit valoir "approved" ou "rejected"' }),
    reason: z.string({ message: 'doit être une chaîne' }).optional(),
  })
  .strict() satisfies z.ZodType<DecisionRequestDto>

export const assignManagerRequestSchema = z
  .object({
    managerId: z.string({ message: 'doit être un identifiant ou null' }).uuid({ message: 'doit être un UUID' }).nullable(),
  })
  .strict() satisfies z.ZodType<AssignManagerRequestDto>

/** Champs du formulaire `multipart/form-data` de soumission d'une note. */
export const expenseNoteFormSchema = z.object({
  amount: z.string({ message: 'requis' }).trim().min(1, 'requis').transform(Number),
  expenseDate: z.string({ message: 'requis' }),
  description: z.string({ message: 'requis' }),
  receipt: z.instanceof(File, { message: 'fichier requis' }),
})

/** Formulaire `multipart/form-data` qui ne porte qu'un reçu (analyse OCR). */
export const receiptFormSchema = z.object({
  receipt: z.instanceof(File, { message: 'fichier requis (multipart/form-data)' }),
})

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: ProblemFieldError[] }

/** Valide `input` ; chaque problème devient une entrée `errors` (JSON Pointer vers le champ). */
export function parseWith<S extends z.ZodTypeAny>(schema: S, input: unknown): Parsed<z.output<S>> {
  const result = schema.safeParse(input)
  if (result.success) return { ok: true, value: result.data }
  return {
    ok: false,
    errors: result.error.issues.map((issue) => toFieldError(issue)),
  }
}

function toFieldError(issue: z.ZodIssue): ProblemFieldError {
  if (issue.code === 'unrecognized_keys') {
    return { pointer: `#/${issue.keys.join(',')}`, detail: 'champ inconnu' }
  }
  if (issue.code === 'invalid_type' && issue.path.length === 0) {
    return { pointer: '#', detail: 'un objet JSON est attendu' }
  }
  return { pointer: `#/${issue.path.join('/')}`, detail: issue.message }
}

/** Les champs d'un `FormData` (dernière valeur de chaque nom), pour les passer à un schéma. */
export function formFields(form: FormData): Record<string, FormDataEntryValue> {
  return Object.fromEntries(form.entries())
}
