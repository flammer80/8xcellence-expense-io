import { describe, expect, it, vi } from 'vitest'
import { respondError } from '@/lib/errors'

// SEC-07 (audit v2) : le détail d'une erreur reste côté serveur, relié à la
// réponse par un id de corrélation.

describe('respondError', () => {
  it('répond 500 avec un message générique et journalise le détail avec le même id', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = respondError(new Error('relation "secret_table" does not exist'))

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toEqual({ error: 'Internal Server Error', correlationId: expect.any(String) })
    expect(log).toHaveBeenCalledWith(expect.stringContaining(body.correlationId), expect.any(Error))
    log.mockRestore()
  })
})
