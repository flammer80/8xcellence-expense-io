import { InvalidInputError } from './errors'

/**
 * Montant d'une note de frais, stocké en centimes entiers pour éviter les
 * erreurs d'arrondi des flottants (la base stocke un `numeric(10, 2)`).
 *
 * La devise n'est pas encore modélisée : tous les montants sont en euros. La
 * colonne `expense_notes.currency` existe déjà (migration 0003, défaut `EUR`).
 */
export class Money {
  private constructor(private readonly cents: number) {}

  /** Construit un montant à partir d'une valeur décimale (`12.5`, `"12.50"`). */
  static fromDecimal(value: number | string): Money {
    const amount = typeof value === 'string' ? Number(value) : value
    if (!Number.isFinite(amount)) {
      throw new InvalidInputError('amount', 'doit être un nombre')
    }
    if (amount < 0) {
      throw new InvalidInputError('amount', 'ne peut pas être négatif')
    }
    const cents = Math.round(amount * 100)
    if (Math.abs(cents - amount * 100) > 1e-6) {
      throw new InvalidInputError('amount', 'au plus deux décimales')
    }
    return new Money(cents)
  }

  get inCents(): number {
    return this.cents
  }

  isPositive(): boolean {
    return this.cents > 0
  }

  compareTo(other: Money): number {
    return this.cents - other.cents
  }

  equals(other: Money): boolean {
    return this.cents === other.cents
  }

  /** Valeur décimale, telle qu'exposée par l'API (`12.5`). */
  toDecimal(): number {
    return this.cents / 100
  }
}
