import { InvalidInputError } from './errors'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Date de la dépense, sans heure ni fuseau : un jour du calendrier au format
 * `YYYY-MM-DD`, tel que Postgres le stocke dans une colonne `date`.
 */
export class ExpenseDate {
  private constructor(private readonly value: string) {}

  static parse(value: string): ExpenseDate {
    const match = ISO_DATE.exec(value)
    if (!match) {
      throw new InvalidInputError('expenseDate', 'format attendu YYYY-MM-DD')
    }
    const [, year, month, day] = match.map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    const isRealDay =
      date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    if (!isRealDay) {
      throw new InvalidInputError('expenseDate', `${value} n'est pas une date valide`)
    }
    return new ExpenseDate(value)
  }

  /** Le format `YYYY-MM-DD` se compare correctement dans l'ordre lexicographique. */
  compareTo(other: ExpenseDate): number {
    return this.value < other.value ? -1 : this.value > other.value ? 1 : 0
  }

  equals(other: ExpenseDate): boolean {
    return this.value === other.value
  }

  toString(): string {
    return this.value
  }
}
