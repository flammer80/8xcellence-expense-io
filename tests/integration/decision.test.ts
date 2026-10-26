import { describe, expect, it } from 'vitest'
import { POST as decide } from '@/app/api/expense-notes/[id]/decision/route'
import { GET as getReceiptUrl } from '@/app/api/expense-notes/[id]/receipt-url/route'
import { GET as listHrQueue } from '@/app/api/hr/expense-notes/route'
import { POST as legacyManagerApprove } from '@/app/api/manager/expense-notes/[id]/approve/route'
import { GET as legacyManagerReceipt } from '@/app/api/manager/expense-notes/[id]/receipt-url/route'
import { createNote, createOrg, createUser, getNoteDecision, getNoteStatus } from '../helpers/factories'
import { jsonRequest, params, request } from '../helpers/http'
import { signInAs, signOut } from '../helpers/session'

// Nouveau contrat de décision (docs/api/openapi.yaml, ADR 0003 et 0004),
// testé de bout en bout contre Postgres.

const call = (id: string, body: unknown) =>
  decide(jsonRequest(`/api/expense-notes/${id}/decision`, 'POST', body), params({ id }))

async function expectProblem(response: Response, status: number, slug: string) {
  expect(response.status).toBe(status)
  expect(response.headers.get('Content-Type')).toBe('application/problem+json')
  const body = await response.json()
  expect(body).toMatchObject({ type: `https://expense.io/problems/${slug}`, status })
  expect(body).not.toHaveProperty('stack')
  return body
}

describe('POST /api/expense-notes/{id}/decision', () => {
  it('le manager direct approuve : 200, note à jour, piste d’audit enregistrée', async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.manager)

    const response = await call(note.id, { decision: 'approved' })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: note.id, status: 'approved' })
    const decision = await getNoteDecision(note.id)
    expect(decision).toMatchObject({ status: 'approved', decided_by: org.manager.id, rejection_reason: null })
    expect(decision.decided_at).toBeInstanceOf(Date)
  })

  it('le rejet stocke le motif facultatif', async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.manager)

    expect((await call(note.id, { decision: 'rejected', reason: 'Reçu illisible' })).status).toBe(200)
    expect(await getNoteDecision(note.id)).toMatchObject({ status: 'rejected', rejection_reason: 'Reçu illisible' })
  })

  it("le RH tranche la note d'un employé sans manager (elle n'est plus bloquée)", async () => {
    const org = await createOrg()
    const newcomer = await createUser(org.companyId, 'employee')
    const note = await createNote(newcomer.id)
    signInAs(org.hr)

    expect((await call(note.id, { decision: 'approved' })).status).toBe(200)
  })

  it("la note d'un RH revient à un autre RH ; un RH seul ne peut pas la trancher", async () => {
    const org = await createOrg()
    const hrNote = await createNote(org.hr.id)
    signInAs(org.hr)
    await expectProblem(await call(hrNote.id, { decision: 'approved' }), 403, 'forbidden')

    const secondHr = await createUser(org.companyId, 'hr_admin')
    signInAs(secondHr)
    expect((await call(hrNote.id, { decision: 'approved' })).status).toBe(200)
  })

  it('401 sans session', async () => {
    signOut()
    await expectProblem(await call('00000000-0000-0000-0000-000000000000', { decision: 'approved' }), 401, 'unauthenticated')
  })

  it('400 avec un seul problem qui liste tous les champs invalides', async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.manager)

    const body = await expectProblem(await call(note.id, { decision: 'maybe', reason: 42, extra: true }), 400, 'invalid-request')

    expect(body.errors.map((error: { pointer: string }) => error.pointer)).toEqual(['#/decision', '#/reason', '#/extra'])
    expect(await getNoteStatus(note.id)).toBe('pending')
  })

  it("403 pour un RH sur la note d'un employé qui a un manager direct", async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.hr)

    await expectProblem(await call(note.id, { decision: 'approved' }), 403, 'forbidden')
    expect(await getNoteStatus(note.id)).toBe('pending')
  })

  it("404 pour un manager qui n'est pas le manager direct : la RLS lui cache la note (ADR 0005)", async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.rootManager)

    await expectProblem(await call(note.id, { decision: 'approved' }), 404, 'not-found')
    expect(await getNoteStatus(note.id)).toBe('pending')
  })

  it("404 pour une note d'une autre entreprise, même pour un RH", async () => {
    const org = await createOrg()
    const other = await createOrg()
    const note = await createNote(other.rootManager.id)
    signInAs(org.hr)

    await expectProblem(await call(note.id, { decision: 'approved' }), 404, 'not-found')
  })

  it("404 pour un identifiant qui n'est pas un UUID, au lieu d'une erreur 500", async () => {
    const org = await createOrg()
    signInAs(org.manager)

    await expectProblem(await call('undefined', { decision: 'approved' }), 404, 'not-found')
  })

  it('409 sur une seconde décision, qui ne modifie pas la première', async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.manager)
    await call(note.id, { decision: 'approved' })

    await expectProblem(await call(note.id, { decision: 'rejected' }), 409, 'already-decided')
    expect(await getNoteStatus(note.id)).toBe('approved')
  })

  it('deux décisions simultanées : une seule passe, l’autre reçoit 409', async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.manager)

    const responses = await Promise.all([
      call(note.id, { decision: 'approved' }),
      call(note.id, { decision: 'rejected' }),
    ])

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409])
  })

  it('422 pour un motif sur une approbation', async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.manager)

    await expectProblem(await call(note.id, { decision: 'approved', reason: 'ok' }), 422, 'invalid-input')
  })
})

describe('GET /api/expense-notes/{id}/receipt-url — route unique des reçus', () => {
  it("sert le reçu au validateur désigné, pas à un autre manager", async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    const url = (actor: Parameters<typeof signInAs>[0]) => {
      signInAs(actor)
      return getReceiptUrl(request(`/api/expense-notes/${note.id}/receipt-url`), params({ id: note.id }))
    }

    expect((await url(org.manager)).status).toBe(200)
    expect((await url(org.rootManager)).status).toBe(404)
  })
})

describe('anciennes routes', () => {
  it('portent les en-têtes de dépréciation vers leur remplaçante', async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.manager)

    const approve = await legacyManagerApprove(
      request(`/api/manager/expense-notes/${note.id}/approve`, { method: 'POST' }),
      params({ id: note.id })
    )
    const receipt = await legacyManagerReceipt(request(`/api/manager/expense-notes/${note.id}/receipt-url`), params({ id: note.id }))

    expect(approve.headers.get('Deprecation')).toBe('true')
    expect(approve.headers.get('Link')).toBe(`</api/expense-notes/${note.id}/decision>; rel="successor-version"`)
    expect(receipt.headers.get('Link')).toBe(`</api/expense-notes/${note.id}/receipt-url>; rel="successor-version"`)
  })

  it("la file du RH inclut désormais les employés sans manager et les autres RH", async () => {
    const org = await createOrg()
    const newcomer = await createUser(org.companyId, 'employee')
    const secondHr = await createUser(org.companyId, 'hr_admin')
    const newcomerNote = await createNote(newcomer.id)
    const secondHrNote = await createNote(secondHr.id)
    const ownNote = await createNote(org.hr.id)
    signInAs(org.hr)

    const ids = (await (await listHrQueue()).json()).map((note: { id: string }) => note.id)

    expect(ids).toEqual(expect.arrayContaining([newcomerNote.id, secondHrNote.id]))
    expect(ids).not.toContain(ownNote.id)
  })
})
