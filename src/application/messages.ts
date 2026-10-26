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

/**
 * Un compte vient d'être inscrit : il faut envoyer le lien de vérification
 * d'email (ADR 0009). Écrit par la fonction SQL d'inscription, dans la même
 * transaction que le compte. Le jeton en clair ne vit que dans ce message.
 */
export type EmailVerificationRequested = DomainEvent<
  'EmailVerificationRequested',
  {
    userId: string
    email: string
    name: string
    token: string
  }
>

/** Tout ce qui transite par l'outbox. */
export type OutboxMessage = ExpenseNoteEvent | ReceiptOcrRequested | EmailVerificationRequested

export type OutboxMessageType = OutboxMessage['type']
