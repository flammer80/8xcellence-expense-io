/**
 * Erreurs du domaine. Elles décrivent une règle métier violée, jamais un
 * détail technique : la couche HTTP les traduit en codes de statut
 * (`NotFoundError` → 404, `ForbiddenError` → 403, `AlreadyDecidedError` → 409,
 * `InvalidInputError` → 400/422).
 */
export abstract class DomainError extends Error {
  protected constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

/** La ressource n'existe pas, ou l'acteur n'a pas le droit d'en connaître l'existence. */
export class NotFoundError extends DomainError {
  constructor(resource: string, id: string) {
    super(`${resource} introuvable : ${id}`)
  }
}

/** L'acteur est identifié mais n'a pas le droit d'effectuer l'action. */
export class ForbiddenError extends DomainError {
  constructor(reason: string) {
    super(reason)
  }
}

/** Une note ne se tranche qu'une fois (règle métier n°5). */
export class AlreadyDecidedError extends DomainError {
  constructor(noteId: string) {
    super(`La note ${noteId} a déjà été tranchée.`)
  }
}

/** Une valeur ne respecte pas les invariants du domaine (montant, date…). */
export class InvalidInputError extends DomainError {
  constructor(
    readonly field: string,
    reason: string
  ) {
    super(`${field} : ${reason}`)
  }
}
