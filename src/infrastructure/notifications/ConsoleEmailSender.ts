import type { EmailSender } from '@/application/ports/EmailSender'

/**
 * Adaptateur de développement : l'email n'est pas envoyé, il est écrit dans
 * les logs du serveur (une ligne JSON), d'où l'on copie le lien.
 */
export class ConsoleEmailSender implements EmailSender {
  async sendEmailVerification(email: { to: string; name: string; verificationUrl: string }): Promise<void> {
    console.log(
      JSON.stringify({
        component: 'email',
        template: 'email-verification',
        to: email.to,
        subject: 'Confirme ton adresse email — Expense.io',
        verificationUrl: email.verificationUrl,
      })
    )
  }
}
