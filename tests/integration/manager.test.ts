import { describe, expect, it } from 'vitest'
import { GET as listPending } from '@/app/api/manager/expense-notes/route'
import { POST as approve } from '@/app/api/manager/expense-notes/[id]/approve/route'
import { POST as reject } from '@/app/api/manager/expense-notes/[id]/reject/route'
import { GET as getReceiptUrl } from '@/app/api/manager/expense-notes/[id]/receipt-url/route'
import { createNote, createOrg, getNoteStatus } from '../helpers/factories'
import { params, request } from '../helpers/http'
import { signInAs, signOut } from '../helpers/session'

// Caractérisation des routes /api/manager/* : comportement actuel, y compris
// le 401 (et non 403) pour un mauvais rôle, à corriger plus tard (ARC-08).

describe('GET /api/manager/expense-notes', () => {
  it('répond 401 sans session ou pour un rôle autre que manager', async () => {
    signOut()
    expect((await listPending()).status).toBe(401)

    const org = await createOrg()
    signInAs(org.employee)
    expect((await listPending()).status).toBe(401)
  })

  it('ne liste que les notes en attente des subordonnés directs, les plus anciennes d’abord', async () => {
    const org = await createOrg()
    const second = await createNote(org.employee.id, { createdAt: '2026-10-02T10:00:00Z' })
    const first = await createNote(org.employee.id, { createdAt: '2026-10-01T10:00:00Z' })
    await createNote(org.employee.id, { status: 'approved' })
    await createNote(org.manager.id)
    signInAs(org.manager)

    const response = await listPending()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.map((note: { id: string }) => note.id)).toEqual([first.id, second.id])
  })
})

describe.each([
  ['approve', approve, 'approved'],
  ['reject', reject, 'rejected'],
] as const)('POST /api/manager/expense-notes/{id}/%s', (action, handler, finalStatus) => {
  const call = (id: string) =>
    handler(request(`/api/manager/expense-notes/${id}/${action}`, { method: 'POST' }), params({ id }))

  it("tranche la note d'un subordonné direct", async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.manager)

    const response = await call(note.id)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: note.id, status: finalStatus })
    expect(await getNoteStatus(note.id)).toBe(finalStatus)
  })

  it("répond 404 pour la note d'un non-subordonné", async () => {
    const org = await createOrg()
    const note = await createNote(org.manager.id)
    signInAs(org.manager)

    expect((await call(note.id)).status).toBe(404)
  })

  it('répond 409 pour une note déjà tranchée', async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id, { status: 'approved' })
    signInAs(org.manager)

    const response = await call(note.id)

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'Already decided' })
  })

  it("répond 401 pour un rôle autre que manager", async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.hr)

    expect((await call(note.id)).status).toBe(401)
  })
})

describe('GET /api/manager/expense-notes/{id}/receipt-url', () => {
  it("renvoie l'URL du reçu d'une note de subordonné", async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.manager)

    const response = await getReceiptUrl(request(`/api/manager/expense-notes/${note.id}/receipt-url`), params({ id: note.id }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ url: `https://s3.test/${note.receiptKey}?signed` })
  })
})
