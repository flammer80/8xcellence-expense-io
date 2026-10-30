import type { EmailSender } from '@/application/ports/EmailSender'
import { logger } from '@/lib/logger'

type Write = (line: string) => void

const writeToStdout: Write = (line) => {
  process.stdout.write(`${line}\n`)
}

/**
 * Adaptateur de développement : l'email n'est pas envoyé, il est écrit sur
 * la sortie standard du serveur (une ligne JSON), d'où l'on copie le lien.
 *
 * Le lien contient un jeton de vérification : cette ligne passe **à côté du
 * logger**, donc n'est jamais exportée vers Loki (ADR 0011). Le logger ne
 * reçoit qu'un événement `email-sent`, sans adresse ni jeton.
 */
export class ConsoleEmailSender implements EmailSender {
  constructor(private readonly write: Write = writeToStdout) {}

  async sendEmailVerification(email: { to: string; name: string; verificationUrl: string }): Promise<void> {
    this.write(
      JSON.stringify({
        component: 'email',
        template: 'email-verification',
        to: email.to,
        subject: 'Confirme ton adresse email — Expense.io',
        verificationUrl: email.verificationUrl,
      })
    )
    logger.info({ event: 'email-sent', template: 'email-verification', adapter: 'console' }, 'email-sent')
  }
}
