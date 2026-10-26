import type { DomainEvent, ExpenseNoteEvent } from '@/domain/events'

/**
 * Job : demande d'analyse OCR d'un reçu. Ce n'est pas un fait métier mais une
 * commande technique ; il partage l'enveloppe et la file des événements pour
 * qu'il n'y ait qu'un seul protocole asynchrone (ADR 0007).
 */
export type ReceiptOcrRequested = DomainEvent<
  'ReceiptOcrRequested',
  {
    suggestionId: string
    requesterId: string
  }
>

/** Tout ce qui transite par l'outbox. */
export type OutboxMessage = ExpenseNoteEvent | ReceiptOcrRequested

export type OutboxMessageType = OutboxMessage['type']
