import type { OutboxMessage } from '../messages'

/** Message réclamé par le worker, avec son état de livraison. */
export interface ClaimedMessage {
  message: OutboxMessage
  /** Nombre de tentatives, celle-ci comprise. */
  attempts: number
  /** Id de corrélation de la requête HTTP d'origine, pour les logs. */
  correlationId: string | null
  /**
   * Contexte de trace W3C (`traceparent`) de la requête d'origine : le
   * traitement du message s'inscrit dans la même trace (ADR 0011).
   */
  traceparent: string | null
}

/** Issue du traitement d'un message par le worker. */
export type MessageOutcome = 'processed' | 'acked-without-consumer' | 'retry-scheduled' | 'dead-letter'

/**
 * Observe le traitement de chaque message (traces, métriques), sans que le
 * worker connaisse l'outil utilisé. `process` doit être appelé une fois ;
 * les logs émis pendant son exécution appartiennent au contexte observé.
 *
 * Implémentation : `OpenTelemetryMessageObserver` (infrastructure).
 */
export interface MessageObserver {
  observe(claimed: ClaimedMessage, process: () => Promise<MessageOutcome>): Promise<MessageOutcome>
}

/**
 * File de messages adossée à la table `outbox` (ADR 0007), vue du worker.
 *
 * Garanties attendues de l'implémentation :
 * - `claim` ne rend jamais le même message à deux workers en même temps, et
 *   pose un bail : un message réclamé mais jamais acquitté (worker planté)
 *   redevient disponible à l'expiration du bail ;
 * - les messages sont rendus dans l'ordre où ils sont survenus.
 *
 * Implémentations : `PostgresOutboxStore` (rôle `expense_worker`),
 * `InMemoryOutboxStore` (tests).
 */
export interface OutboxStore {
  /** Réclame au plus `limit` messages disponibles, pour `leaseSeconds` secondes. */
  claim(limit: number, leaseSeconds: number): Promise<ClaimedMessage[]>
  /** Acquitte : le message est traité et ne sera plus redistribué. */
  ack(messageId: string): Promise<void>
  /** Échec temporaire : le message sera redistribué à partir de `availableAt`. */
  retry(messageId: string, error: string, availableAt: Date): Promise<void>
  /** Échec définitif : le message part en lettre morte (DLQ), pour traitement manuel. */
  bury(messageId: string, error: string): Promise<void>
}
