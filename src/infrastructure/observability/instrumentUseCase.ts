import { SpanStatusCode, type Attributes } from '@opentelemetry/api'
import { DomainError } from '@/domain/errors'
import { tracer } from '@/lib/telemetry'

/** Un cas d'usage : une seule méthode `execute` (convention de `src/application`). */
export interface UseCase<I, O> {
  execute(input: I): Promise<O>
}

export interface UseCaseHooks<I, O> {
  /** Appelé après un succès : métriques métier propres au cas d'usage. */
  onSuccess?: (output: O, input: I) => void
}

/**
 * Identifiants repris de l'entrée comme attributs du span. Liste fermée : ni
 * email, ni nom, ni montant, ni description (pas de donnée personnelle dans
 * la télémétrie, ADR 0011).
 */
const INPUT_ATTRIBUTES: Record<string, string> = {
  actorId: 'enduser.id',
  noteId: 'expense.note.id',
  userId: 'expense.target_user.id',
  managerId: 'expense.manager.id',
  suggestionId: 'expense.receipt_suggestion.id',
  decision: 'expense.decision',
}

function inputAttributes(input: unknown): Attributes {
  if (typeof input !== 'object' || input === null) return {}
  const attributes: Attributes = {}
  for (const [field, attribute] of Object.entries(INPUT_ATTRIBUTES)) {
    const value = (input as Record<string, unknown>)[field]
    if (typeof value === 'string') attributes[attribute] = value
  }
  return attributes
}

/** Entreprise (tenant) de la note ou de l'utilisateur renvoyé, s'il y en a une. */
function companyIdOf(output: unknown): string | null {
  if (typeof output !== 'object' || output === null || !('companyId' in output)) return null
  return typeof output.companyId === 'string' ? output.companyId : null
}

/**
 * Décorateur posé par la racine de composition : chaque appel du cas
 * d'usage devient un span `usecase <Nom>`. La couche application reste
 * ignorante d'OpenTelemetry (garde-fou ESLint).
 *
 * Une erreur du domaine (404, 403, 409, 422) est un résultat métier attendu :
 * elle est notée en attribut (`expense.outcome`) sans marquer le span en
 * erreur. Toute autre exception est une panne : span en erreur, exception
 * enregistrée.
 */
export function instrumentUseCase<I, O>(name: string, useCase: UseCase<I, O>, hooks: UseCaseHooks<I, O> = {}): UseCase<I, O> {
  return {
    execute: (input) =>
      tracer().startActiveSpan(`usecase ${name}`, { attributes: { 'expense.usecase': name, ...inputAttributes(input) } }, async (span) => {
        try {
          const output = await useCase.execute(input)
          span.setAttribute('expense.outcome', 'success')
          const companyId = companyIdOf(output)
          if (companyId) span.setAttribute('expense.company.id', companyId)
          hooks.onSuccess?.(output, input)
          return output
        } catch (error) {
          if (error instanceof DomainError) {
            span.setAttribute('expense.outcome', error.name)
          } else {
            span.recordException(error instanceof Error ? error : String(error))
            span.setStatus({ code: SpanStatusCode.ERROR })
          }
          throw error
        } finally {
          span.end()
        }
      }),
  }
}
