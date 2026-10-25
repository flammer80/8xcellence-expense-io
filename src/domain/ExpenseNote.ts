import { AlreadyDecidedError } from './errors'
import type { ExpenseDate } from './ExpenseDate'
import type { Money } from './Money'

export type ExpenseNoteStatus = 'pending' | 'approved' | 'rejected'

export interface ExpenseNoteProps {
  id: string
  /** Auteur de la note. */
  userId: string
  amount: Money
  expenseDate: ExpenseDate
  description: string
  /** Clé de l'objet reçu dans le stockage ; ne doit pas sortir de l'API à terme (ARC-07). */
  receiptKey: string
  status: ExpenseNoteStatus
  createdAt: Date
}

/**
 * Note de frais. Immuable : chaque décision renvoie une nouvelle instance.
 *
 * Invariant porté ici : une note ne se tranche qu'une fois, `pending` →
 * `approved` ou `rejected` (règle métier n°5). Qui a le droit de trancher
 * relève de l'`ApprovalPolicy` (étape 3), pas de l'entité.
 */
export class ExpenseNote {
  constructor(private readonly props: ExpenseNoteProps) {}

  get id(): string {
    return this.props.id
  }

  get userId(): string {
    return this.props.userId
  }

  get amount(): Money {
    return this.props.amount
  }

  get expenseDate(): ExpenseDate {
    return this.props.expenseDate
  }

  get description(): string {
    return this.props.description
  }

  get receiptKey(): string {
    return this.props.receiptKey
  }

  get status(): ExpenseNoteStatus {
    return this.props.status
  }

  get createdAt(): Date {
    return this.props.createdAt
  }

  canBeDecided(): boolean {
    return this.props.status === 'pending'
  }

  /** @throws AlreadyDecidedError si la note n'est plus en attente. */
  approve(): ExpenseNote {
    return this.decide('approved')
  }

  /** @throws AlreadyDecidedError si la note n'est plus en attente. */
  reject(): ExpenseNote {
    return this.decide('rejected')
  }

  private decide(status: Exclude<ExpenseNoteStatus, 'pending'>): ExpenseNote {
    if (!this.canBeDecided()) {
      throw new AlreadyDecidedError(this.props.id)
    }
    return new ExpenseNote({ ...this.props, status })
  }
}
