import type { EmailVerificationRequested } from '../messages'
import type { MessageHandler } from '../OutboxWorker'
import type { EmailSender } from '../ports/EmailSender'

/**
 * Consommateur de `EmailVerificationRequested` (v1) : envoie le lien de
 * vérification au nouvel inscrit (ADR 0009).
 *
 * Rejouer le message renvoie le même lien, toujours valable : sans effet
 * nuisible, d'où l'absence de déduplication.
 */
export class SendVerificationEmail implements MessageHandler<EmailVerificationRequested> {
  constructor(
    private readonly emails: EmailSender,
    /** URL publique de l'application, sans `/` final (ex. `https://app.expense.io`). */
    private readonly appUrl: string
  ) {}

  async handle(message: EmailVerificationRequested): Promise<void> {
    const { email, name, token } = message.payload
    await this.emails.sendEmailVerification({
      to: email,
      name,
      verificationUrl: `${this.appUrl}/verify-email?token=${encodeURIComponent(token)}`,
    })
  }
}
