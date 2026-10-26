/**
 * Envoi d'emails transactionnels (commodité : *buy* plutôt que *build*,
 * cours n°2).
 *
 * Peut lever en cas de panne du fournisseur : le worker de l'outbox retente,
 * puis met le message en lettre morte.
 *
 * Implémentation : `ConsoleEmailSender` (développement : l'email est écrit
 * dans les logs du serveur). Un fournisseur réel (SMTP, Brevo, SES…)
 * s'ajoutera comme un autre adaptateur de ce port.
 */
export interface EmailSender {
  sendEmailVerification(email: { to: string; name: string; verificationUrl: string }): Promise<void>
}
