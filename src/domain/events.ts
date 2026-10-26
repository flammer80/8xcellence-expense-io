import type { ExpenseNote, ExpenseNoteDecision } from './ExpenseNote'

/**
 * Enveloppe d'un événement de domaine : ce qui s'est passé, pour quelle
 * entreprise, et quand. `type` + `version` forment le **contrat** du message :
 * un consommateur ne lit que les versions qu'il connaît, et un changement de
 * payload se fait par une nouvelle version, jamais en place (cours n°2,
 * « contract first »).
 */
export interface DomainEvent<TType extends string, TPayload> {
  id: string
  type: TType
  version: number
  companyId: string
  occurredAt: Date
  payload: TPayload
}

/** Une note vient d'être soumise. Aucun consommateur aujourd'hui : point d'extension (catégorisation IA, notification du validateur). */
export type ExpenseNoteSubmitted = DomainEvent<
  'ExpenseNoteSubmitted',
  {
    noteId: string
    authorId: string
    amount: number
    currency: 'EUR'
    expenseDate: string
    description: string
  }
>

/**
 * Une note vient d'être tranchée. Le payload porte ce qu'il faut pour
 * prévenir l'auteur sans relire la note (« event-carried state transfer »).
 */
export type ExpenseNoteDecided = DomainEvent<
  'ExpenseNoteDecided',
  {
    noteId: string
    authorId: string
    description: string
    amount: number
    decision: ExpenseNoteDecision
    decidedBy: string
    rejectionReason: string | null
  }
>

export type ExpenseNoteEvent = ExpenseNoteSubmitted | ExpenseNoteDecided

/** Événement émis à la soumission de `note`. */
export function expenseNoteSubmitted(note: ExpenseNote, eventId: string): ExpenseNoteSubmitted {
  return {
    id: eventId,
    type: 'ExpenseNoteSubmitted',
    version: 1,
    companyId: note.companyId,
    occurredAt: note.createdAt,
    payload: {
      noteId: note.id,
      authorId: note.userId,
      amount: note.amount.toDecimal(),
      currency: 'EUR',
      expenseDate: note.expenseDate.toString(),
      description: note.description,
    },
  }
}

/**
 * Événement émis quand `note` vient d'être tranchée.
 * @throws Error si la note n'a pas de décision enregistrée (erreur de programmation).
 */
export function expenseNoteDecided(note: ExpenseNote, eventId: string): ExpenseNoteDecided {
  if (note.status === 'pending' || !note.decidedBy || !note.decidedAt) {
    throw new Error(`La note ${note.id} n'est pas tranchée : aucun événement de décision possible.`)
  }
  return {
    id: eventId,
    type: 'ExpenseNoteDecided',
    version: 1,
    companyId: note.companyId,
    occurredAt: note.decidedAt,
    payload: {
      noteId: note.id,
      authorId: note.userId,
      description: note.description,
      amount: note.amount.toDecimal(),
      decision: note.status,
      decidedBy: note.decidedBy,
      rejectionReason: note.rejectionReason,
    },
  }
}
