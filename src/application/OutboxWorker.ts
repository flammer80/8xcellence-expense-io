import type { OutboxMessage, OutboxMessageType } from './messages'
import type { ClaimedMessage, OutboxStore } from './ports/OutboxStore'

/** Consommateur d'un type de message. Doit être idempotent : un message peut être livré plusieurs fois. */
export interface MessageHandler<M extends OutboxMessage> {
  handle(message: M): Promise<void>
  /** Appelé une fois, quand le message part en lettre morte (DLQ). */
  onDeadLetter?(message: M): Promise<void>
}

/** Au plus un consommateur par type (chorégraphie : chacun réagit au message qui le concerne). */
export type MessageHandlers = {
  [T in OutboxMessageType]?: MessageHandler<Extract<OutboxMessage, { type: T }>>
}

/** Versions de contrat que les consommateurs savent lire. */
const SUPPORTED_VERSION: Record<OutboxMessageType, number> = {
  ExpenseNoteSubmitted: 1,
  ExpenseNoteDecided: 1,
  ReceiptOcrRequested: 1,
}

export interface OutboxWorkerOptions {
  /** Tentatives avant la lettre morte. */
  maxAttempts: number
  batchSize: number
  /** Durée du bail : sans acquittement dans ce délai, le message est redistribué. */
  leaseSeconds: number
  /** Délai avant la tentative suivante, en fonction du nombre de tentatives déjà faites. */
  retryDelayMs: (attempts: number) => number
}

export const DEFAULT_OUTBOX_WORKER_OPTIONS: OutboxWorkerOptions = {
  maxAttempts: 5,
  batchSize: 10,
  leaseSeconds: 60,
  // 2 s, 4 s, 8 s, 16 s… plafonné à 5 minutes.
  retryDelayMs: (attempts) => Math.min(2 ** attempts * 1000, 5 * 60 * 1000),
}

export type WorkerLog = (entry: Record<string, unknown>) => void

const consoleLog: WorkerLog = (entry) => console.log(JSON.stringify({ component: 'outbox-worker', ...entry }))

/**
 * Worker unique de l'asynchrone (ADR 0007) : réclame les messages de
 * l'outbox, les passe à leur consommateur, puis les acquitte.
 *
 * - Succès → acquitté (`ack`).
 * - Échec → redistribué plus tard (backoff exponentiel), puis en lettre
 *   morte après `maxAttempts` tentatives.
 * - Message sans consommateur → acquitté : publier un événement que personne
 *   n'écoute encore est normal (point d'extension).
 * - Version de contrat inconnue → lettre morte directe : la rejouer ne
 *   servirait à rien.
 *
 * Chaque log porte l'id de corrélation de la requête HTTP d'origine.
 */
export class OutboxWorker {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false

  constructor(
    private readonly store: OutboxStore,
    private readonly handlers: MessageHandlers,
    private readonly options: OutboxWorkerOptions = DEFAULT_OUTBOX_WORKER_OPTIONS,
    private readonly log: WorkerLog = consoleLog,
    private readonly now: () => Date = () => new Date()
  ) {}

  /** Traite un lot de messages disponibles. @returns le nombre de messages réclamés. */
  async processBatch(): Promise<number> {
    const claimed = await this.store.claim(this.options.batchSize, this.options.leaseSeconds)
    for (const item of claimed) {
      await this.process(item)
    }
    return claimed.length
  }

  /** Traite les messages jusqu'à ce qu'il n'y en ait plus de disponible (tests, scripts). */
  async drain(): Promise<void> {
    while ((await this.processBatch()) > 0) {
      // On boucle tant que des messages sont disponibles.
    }
  }

  /** Lance la boucle de fond : un lot, puis une pause de `intervalMs` quand la file est vide. */
  start(intervalMs = 1000): void {
    if (this.running) return
    this.running = true
    const tick = async () => {
      let claimed = 0
      try {
        claimed = await this.processBatch()
      } catch (error) {
        this.log({ level: 'error', event: 'batch-failed', error: describe(error) })
      }
      if (this.running) this.timer = setTimeout(tick, claimed > 0 ? 0 : intervalMs)
    }
    this.log({ level: 'info', event: 'started', intervalMs })
    void tick()
  }

  stop(): void {
    this.running = false
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private async process({ message, attempts, correlationId }: ClaimedMessage): Promise<void> {
    const context = { messageId: message.id, type: message.type, version: message.version, attempts, correlationId }

    if (message.version !== SUPPORTED_VERSION[message.type]) {
      await this.store.bury(message.id, `version ${message.version} non supportée`)
      this.log({ level: 'error', event: 'dead-letter', reason: 'unsupported-version', ...context })
      return
    }

    const handler = this.handlers[message.type] as MessageHandler<OutboxMessage> | undefined
    if (!handler) {
      await this.store.ack(message.id)
      this.log({ level: 'info', event: 'acked-without-consumer', ...context })
      return
    }

    try {
      await handler.handle(message)
      await this.store.ack(message.id)
      this.log({ level: 'info', event: 'processed', ...context })
    } catch (error) {
      await this.fail(message, attempts, error, handler, context)
    }
  }

  private async fail(
    message: OutboxMessage,
    attempts: number,
    error: unknown,
    handler: MessageHandler<OutboxMessage>,
    context: Record<string, unknown>
  ): Promise<void> {
    const reason = describe(error)
    if (attempts < this.options.maxAttempts) {
      const availableAt = new Date(this.now().getTime() + this.options.retryDelayMs(attempts))
      await this.store.retry(message.id, reason, availableAt)
      this.log({ level: 'warn', event: 'retry-scheduled', error: reason, availableAt, ...context })
      return
    }
    await this.store.bury(message.id, reason)
    this.log({ level: 'error', event: 'dead-letter', error: reason, ...context })
    try {
      await handler.onDeadLetter?.(message)
    } catch (deadLetterError) {
      this.log({ level: 'error', event: 'dead-letter-hook-failed', error: describe(deadLetterError), ...context })
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
