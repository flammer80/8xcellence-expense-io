import { describe, expect, it } from 'vitest'
import { POST } from '@/app/api/expense-notes/route'
import { createOrg } from '../helpers/factories'
import { noteForm, request } from '../helpers/http'
import { signInAs } from '../helpers/session'

// SEC-07 (audit v2) : toute exception renvoyait son message et sa stack au
// client. Déclencheur choisi : une date invalide, rejetée par Postgres
// (tant que la validation d'entrée n'existe pas, cf. SEC-11).

describe('SEC-07 — fuite des erreurs internes', () => {
  it('ne renvoie ni stack ni message SQL au client', async () => {
    const org = await createOrg()
    signInAs(org.employee)

    const response = await POST(
      request('/api/expense-notes', { method: 'POST', body: noteForm({ expenseDate: 'pas-une-date' }) })
    )

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).not.toHaveProperty('stack')
    expect(JSON.stringify(body)).not.toMatch(/date|syntax|node_modules|\.ts/i)
    expect(body).toEqual({ error: 'Internal Server Error', correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/) })
  })
})
