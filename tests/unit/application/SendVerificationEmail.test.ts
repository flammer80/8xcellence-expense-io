import { describe, expect, it } from 'vitest'
import { SendVerificationEmail } from '@/application/handlers/SendVerificationEmail'
import type { EmailVerificationRequested } from '@/application/messages'

describe('SendVerificationEmail', () => {
  it('envoie au nouvel inscrit un lien qui porte son jeton', async () => {
    const sent: unknown[] = []
    const handler = new SendVerificationEmail({ sendEmailVerification: async (email) => void sent.push(email) }, 'https://app.test')
    const message: EmailVerificationRequested = {
      id: 'm1',
      type: 'EmailVerificationRequested',
      version: 1,
      companyId: 'acme',
      occurredAt: new Date(),
      payload: { userId: 'u1', email: 'alice@acme.fr', name: 'Alice', token: 'a+b/c' },
    }

    await handler.handle(message)

    expect(sent).toEqual([
      { to: 'alice@acme.fr', name: 'Alice', verificationUrl: 'https://app.test/verify-email?token=a%2Bb%2Fc' },
    ])
  })
})
