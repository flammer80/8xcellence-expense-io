import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/manager/expense-notes/[id]/receipt-url/route'
import { getReceiptUrl } from '@/lib/storage'
import { createNote, createOrg } from '../helpers/factories'
import { params, request } from '../helpers/http'
import { signInAs } from '../helpers/session'

// SEC-04 (audit v2) : la route lisait le reçu par le seul id de la note, sans
// vérifier qu'elle appartient à un subordonné du manager connecté.

const call = (id: string) =>
  GET(request(`/api/manager/expense-notes/${id}/receipt-url`), params({ id }))

describe('SEC-04 — IDOR sur le reçu côté manager', () => {
  it("refuse le reçu d'une note d'une autre entreprise", async () => {
    const victim = await createOrg('victim')
    const attacker = await createOrg('attacker')
    const note = await createNote(victim.employee.id)
    signInAs(attacker.manager)

    const response = await call(note.id)

    expect(response.status).toBe(404)
    expect(getReceiptUrl).not.toHaveBeenCalled()
  })

  it("refuse le reçu d'une note de la même entreprise hors de son équipe", async () => {
    const org = await createOrg()
    const note = await createNote(org.rootManager.id)
    signInAs(org.manager)

    const response = await call(note.id)

    expect(response.status).toBe(404)
    expect(getReceiptUrl).not.toHaveBeenCalled()
  })
})
