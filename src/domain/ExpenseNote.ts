import { AlreadyDecidedError, InvalidInputError } from './errors'
import type { ExpenseDate } from './ExpenseDate'
import type { Money } from './Money'

export type ExpenseNoteStatus = 'pending' | 'approved' | 'rejected'

/** Issue d'une décision : l'état final d'une note. */
export type ExpenseNoteDecision = Exclude<ExpenseNoteStatus, 'pending'>

/** Longueur maximale d'un motif de rejet. */
export const MAX_REJECTION_REASON_LENGTH = 1000

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
  /**
   * Piste d'audit de la décision. `null` tant que la note est en attente, et
   * pour les notes tranchées avant que la décision soit enregistrée.
   */
  decidedBy: string | null
  decidedAt: Date | null
  /** Motif facultatif, seulement pour un rejet (ADR 0003). */
  rejectionReason: string | null
}

/**
 * Note de frais. Immuable : chaque décision renvoie une nouvelle instance.
 *
 * Invariant porté ici : une note ne se tranche qu'une fois, `pending` →
 * `approved` ou `rejected` (règle métier n°5). Qui a le droit de trancher
 * relève de l'`ApprovalPolicy`, pas de l'entité.
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

  get decidedBy(): string | null {
    return this.props.decidedBy
  }

  get decidedAt(): Date | null {
    return this.props.decidedAt
  }

  get rejectionReason(): string | null {
    return this.props.rejectionReason
  }

  canBeDecided(): boolean {
    return this.props.status === 'pending'
  }

  /** @throws AlreadyDecidedError si la note n'est plus en attente. */
  approve(decidedBy: string, decidedAt: Date): ExpenseNote {
    return this.decide('approved', decidedBy, decidedAt, null)
  }

  /**
   * @param reason motif facultatif ; une chaîne vide équivaut à aucun motif.
   * @throws AlreadyDecidedError si la note n'est plus en attente.
   * @throws InvalidInputError si le motif dépasse `MAX_REJECTION_REASON_LENGTH`.
   */
  reject(decidedBy: string, decidedAt: Date, reason?: string | null): ExpenseNote {
    const trimmed = reason?.trim() || null
    if (trimmed && trimmed.length > MAX_REJECTION_REASON_LENGTH) {
      throw new InvalidInputError('reason', `au plus ${MAX_REJECTION_REASON_LENGTH} caractères`)
    }
    return this.decide('rejected', decidedBy, decidedAt, trimmed)
  }

  private decide(
    status: ExpenseNoteDecision,
    decidedBy: string,
    decidedAt: Date,
    rejectionReason: string | null
  ): ExpenseNote {
    if (!this.canBeDecided()) {
      throw new AlreadyDecidedError(this.props.id)
    }
    return new ExpenseNote({ ...this.props, status, decidedBy, decidedAt, rejectionReason })
  }
}
