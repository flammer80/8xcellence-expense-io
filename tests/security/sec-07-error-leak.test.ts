import { describe, expect, it } from 'vitest'
import { POST } from '@/app/api/expense-notes/route'
import { uploadReceipt } from '@/lib/storage'
import { createOrg } from '../helpers/factories'
import { noteForm, request } from '../helpers/http'
import { signInAs } from '../helpers/session'

// SEC-07 (audit v2) : toute exception renvoyait son message et sa stack au
// client. La date invalide qui servait de déclencheur est désormais validée
// en amont (400) : on simule une panne interne dont le message contient du
// SQL et un chemin de fichier, comme une erreur réelle du driver.

describe('SEC-07 — fuite des erreurs internes', () => {
  it('ne renvoie ni stack ni message SQL au client', async () => {
    const org = await createOrg()
    signInAs(org.employee)
    const upload = uploadReceipt as unknown as { mockRejectedValueOnce: (error: Error) => void }
    upload.mockRejectedValueOnce(new Error('syntax error at or near "date" (node_modules/pg/lib/client.ts)'))

    const response = await POST(request('/api/expense-notes', { method: 'POST', body: noteForm({}) }))

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).not.toHaveProperty('stack')
    expect(JSON.stringify(body)).not.toMatch(/date|syntax|node_modules|\.ts/i)
    expect(body).toEqual({ error: 'Internal Server Error', correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/) })
  })
})
