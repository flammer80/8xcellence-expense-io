import type { OutboxMessage } from '@/application/messages'
import type { ClaimedMessage, OutboxStore } from '@/application/ports/OutboxStore'

interface StoredMessage {
  message: OutboxMessage
  attempts: number
  availableAt: Date
  lockedUntil: Date | null
  lastError: string | null
  processedAt: Date | null
  deadAt: Date | null
}

/** Adaptateur de test de l'outbox : même cycle de livraison que Postgres (bail, retry, DLQ). */
export class InMemoryOutboxStore implements OutboxStore {
  readonly messages = new Map<string, StoredMessage>()

  constructor(private readonly now: () => Date = () => new Date()) {}

  publish(...messages: OutboxMessage[]): void {
    for (const message of messages) {
      this.messages.set(message.id, {
        message,
        attempts: 0,
        availableAt: message.occurredAt,
        lockedUntil: null,
        lastError: null,
        processedAt: null,
        deadAt: null,
      })
    }
  }

  async claim(limit: number, leaseSeconds: number): Promise<ClaimedMessage[]> {
    const now = this.now()
    const ready = [...this.messages.values()]
      .filter((m) => !m.processedAt && !m.deadAt && m.availableAt <= now && (!m.lockedUntil || m.lockedUntil < now))
      .sort((a, b) => a.message.occurredAt.getTime() - b.message.occurredAt.getTime())
      .slice(0, limit)
    return ready.map((m) => {
      m.attempts += 1
      m.lockedUntil = new Date(now.getTime() + leaseSeconds * 1000)
      return { message: m.message, attempts: m.attempts, correlationId: null }
    })
  }

  async ack(messageId: string): Promise<void> {
    this.update(messageId, { processedAt: this.now(), lockedUntil: null })
  }

  async retry(messageId: string, error: string, availableAt: Date): Promise<void> {
    this.update(messageId, { availableAt, lastError: error, lockedUntil: null })
  }

  async bury(messageId: string, error: string): Promise<void> {
    this.update(messageId, { deadAt: this.now(), lastError: error, lockedUntil: null })
  }

  private update(messageId: string, changes: Partial<StoredMessage>): void {
    const stored = this.messages.get(messageId)
    if (stored) Object.assign(stored, changes)
  }
}
