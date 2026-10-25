import { describe, expect, it } from 'vitest'
import { GET as listRootManagerNotes } from '@/app/api/hr/expense-notes/route'
import { POST as approve } from '@/app/api/hr/expense-notes/[id]/approve/route'
import { POST as reject } from '@/app/api/hr/expense-notes/[id]/reject/route'
import { GET as getReceiptUrl } from '@/app/api/hr/expense-notes/[id]/receipt-url/route'
import { GET as listUsers } from '@/app/api/hr/users/route'
import { PUT as assignManager } from '@/app/api/hr/users/[id]/manager/route'
import { createNote, createOrg, getManagerId, getNoteStatus } from '../helpers/factories'
import { jsonRequest, params, request } from '../helpers/http'
import { signInAs, signOut } from '../helpers/session'

// Caractérisation des routes /api/hr/* : comportement actuel, y compris le
// 403 renvoyé à un visiteur non connecté (ARC-08, à corriger plus tard).

describe('GET /api/hr/expense-notes', () => {
  it('répond 403 sans session ou pour un rôle autre que RH', async () => {
    signOut()
    expect((await listRootManagerNotes()).status).toBe(403)

    const org = await createOrg()
    signInAs(org.manager)
    expect((await listRootManagerNotes()).status).toBe(403)
  })

  it("ne liste que les notes en attente des managers racine de l'entreprise", async () => {
    const org = await createOrg()
    const other = await createOrg()
    const rootNote = await createNote(org.rootManager.id)
    await createNote(org.rootManager.id, { status: 'rejected' })
    await createNote(org.manager.id)
    await createNote(org.employee.id)
    await createNote(other.rootManager.id)
    signInAs(org.hr)

    const response = await listRootManagerNotes()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.map((note: { id: string }) => note.id)).toEqual([rootNote.id])
  })
})

describe.each([
  ['approve', approve, 'approved'],
  ['reject', reject, 'rejected'],
] as const)('POST /api/hr/expense-notes/{id}/%s', (action, handler, finalStatus) => {
  const call = (id: string) =>
    handler(request(`/api/hr/expense-notes/${id}/${action}`, { method: 'POST' }), params({ id }))

  it("tranche la note d'un manager racine de l'entreprise", async () => {
    const org = await createOrg()
    const note = await createNote(org.rootManager.id)
    signInAs(org.hr)

    const response = await call(note.id)

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: note.id, status: finalStatus })
    expect(await getNoteStatus(note.id)).toBe(finalStatus)
  })

  it("répond 404 pour un manager non racine ou une autre entreprise", async () => {
    const org = await createOrg()
    const other = await createOrg()
    const nonRoot = await createNote(org.manager.id)
    const otherCompany = await createNote(other.rootManager.id)
    signInAs(org.hr)

    expect((await call(nonRoot.id)).status).toBe(404)
    expect((await call(otherCompany.id)).status).toBe(404)
  })

  it('répond 409 pour une note déjà tranchée', async () => {
    const org = await createOrg()
    const note = await createNote(org.rootManager.id, { status: 'approved' })
    signInAs(org.hr)

    expect((await call(note.id)).status).toBe(409)
  })
})

describe('GET /api/hr/expense-notes/{id}/receipt-url', () => {
  it("renvoie l'URL pour un manager racine de l'entreprise, 404 sinon", async () => {
    const org = await createOrg()
    const other = await createOrg()
    const own = await createNote(org.rootManager.id)
    const foreign = await createNote(other.rootManager.id)
    signInAs(org.hr)

    const ok = await getReceiptUrl(request(`/api/hr/expense-notes/${own.id}/receipt-url`), params({ id: own.id }))
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ url: `https://s3.test/${own.receiptKey}?signed` })

    const ko = await getReceiptUrl(request(`/api/hr/expense-notes/${foreign.id}/receipt-url`), params({ id: foreign.id }))
    expect(ko.status).toBe(404)
  })
})

describe('GET /api/hr/users', () => {
  it("liste les employés et managers de l'entreprise, triés par nom", async () => {
    const org = await createOrg()
    await createOrg()
    signInAs(org.hr)

    const response = await listUsers()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.map((user: { id: string }) => user.id).sort()).toEqual(
      [org.rootManager.id, org.manager.id, org.employee.id].sort()
    )
    const names = body.map((user: { name: string }) => user.name)
    expect(names).toEqual([...names].sort())
    expect(body.find((user: { id: string }) => user.id === org.employee.id)).toEqual({
      id: org.employee.id,
      name: expect.any(String),
      email: org.employee.email,
      role: 'employee',
      managerId: org.manager.id,
    })
  })
})

describe('PUT /api/hr/users/{id}/manager', () => {
  const call = (id: string, body: unknown) =>
    assignManager(jsonRequest(`/api/hr/users/${id}/manager`, 'PUT', body), params({ id }))

  it("rattache un employé à un manager de l'entreprise", async () => {
    const org = await createOrg()
    signInAs(org.hr)

    const response = await call(org.employee.id, { managerId: org.rootManager.id })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      id: org.employee.id,
      name: expect.any(String),
      email: org.employee.email,
      role: 'employee',
      managerId: org.rootManager.id,
    })
    expect(await getManagerId(org.employee.id)).toBe(org.rootManager.id)
  })

  it('détache le manager avec managerId: null', async () => {
    const org = await createOrg()
    signInAs(org.hr)

    const response = await call(org.employee.id, { managerId: null })

    expect(response.status).toBe(200)
    expect(await getManagerId(org.employee.id)).toBeNull()
  })

  it("répond 404 pour une cible d'une autre entreprise", async () => {
    const org = await createOrg()
    const other = await createOrg()
    signInAs(org.hr)

    expect((await call(other.employee.id, { managerId: org.rootManager.id })).status).toBe(404)
  })

  it("répond 409 si la cible est son propre manager ou si le manager n'en est pas un", async () => {
    const org = await createOrg()
    signInAs(org.hr)

    expect((await call(org.manager.id, { managerId: org.manager.id })).status).toBe(409)
    expect((await call(org.manager.id, { managerId: org.employee.id })).status).toBe(409)
  })
})
