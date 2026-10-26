import { describe, expect, it } from 'vitest'
import { GET as listPending } from '@/app/api/expense-notes/pending/route'
import { GET as legacyHrUsers } from '@/app/api/hr/users/route'
import { GET as legacyManagerQueue } from '@/app/api/manager/expense-notes/route'
import { PUT as assignManager } from '@/app/api/users/[id]/manager/route'
import { GET as listUsers } from '@/app/api/users/route'
import { createNote, createOrg, createUser, getManagerId } from '../helpers/factories'
import { jsonRequest, params } from '../helpers/http'
import { signInAs, signOut } from '../helpers/session'

// Nouveau contrat de l'étape 6 (docs/api/openapi.yaml 2.0.0, ADR 0008) :
// RFC 9457 partout, 401 / 403 / 404 / 422 cohérents.

const assign = (id: string, body: unknown) =>
  assignManager(jsonRequest(`/api/users/${id}/manager`, 'PUT', body), params({ id }))

async function expectProblem(response: Response, status: number, slug: string) {
  expect(response.status).toBe(status)
  expect(response.headers.get('Content-Type')).toBe('application/problem+json')
  const body = await response.json()
  expect(body).toMatchObject({ type: `https://expense.io/problems/${slug}`, status })
  return body
}

describe('GET /api/expense-notes/pending', () => {
  it('donne au manager les notes de ses subordonnés, avec le nom de l’auteur', async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.manager)

    const response = await listPending()

    expect(response.status).toBe(200)
    const [item] = await response.json()
    expect(item).toMatchObject({ id: note.id, userId: org.employee.id, authorName: expect.any(String) })
    expect(item.authorName).not.toBe(org.employee.id)
    expect(item).not.toHaveProperty('receiptKey')
  })

  it('donne au RH les notes des utilisateurs sans manager ; liste vide pour un employé', async () => {
    const org = await createOrg()
    const rootNote = await createNote(org.rootManager.id)
    await createNote(org.employee.id)

    signInAs(org.hr)
    expect((await (await listPending()).json()).map((n: { id: string }) => n.id)).toEqual([rootNote.id])
    signInAs(org.employee)
    expect(await (await listPending()).json()).toEqual([])
  })

  it('401 sans session', async () => {
    signOut()
    await expectProblem(await listPending(), 401, 'unauthenticated')
  })

  it('l’ancienne route manager reste disponible, dépréciée, avec le même contenu', async () => {
    const org = await createOrg()
    await createNote(org.employee.id)
    signInAs(org.manager)

    const response = await legacyManagerQueue()

    expect(response.status).toBe(200)
    expect(response.headers.get('Link')).toBe('</api/expense-notes/pending>; rel="successor-version"')
    expect((await response.json())[0]).toHaveProperty('authorName')
  })
})

describe('GET /api/users', () => {
  it("donne au RH l'annuaire de son entreprise, sans les RH", async () => {
    const org = await createOrg()
    await createOrg('other')
    signInAs(org.hr)

    const response = await listUsers()

    expect(response.status).toBe(200)
    const ids = (await response.json()).map((u: { id: string }) => u.id).sort()
    expect(ids).toEqual([org.rootManager.id, org.manager.id, org.employee.id].sort())
  })

  it('403 (et non 401) pour un utilisateur connecté qui n’est pas RH (A7)', async () => {
    const org = await createOrg()
    signInAs(org.manager)
    await expectProblem(await listUsers(), 403, 'forbidden')
  })

  it('401 sans session', async () => {
    signOut()
    await expectProblem(await listUsers(), 401, 'unauthenticated')
  })

  it('l’ancienne route RH reste disponible, dépréciée', async () => {
    const org = await createOrg()
    signInAs(org.hr)
    const response = await legacyHrUsers()
    expect(response.status).toBe(200)
    expect(response.headers.get('Deprecation')).toBe('true')
  })
})

describe('PUT /api/users/{id}/manager', () => {
  it("rattache un employé et renvoie l'utilisateur à jour", async () => {
    const org = await createOrg()
    signInAs(org.hr)

    const response = await assign(org.employee.id, { managerId: org.rootManager.id })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ id: org.employee.id, managerId: org.rootManager.id })
    expect(await getManagerId(org.employee.id)).toBe(org.rootManager.id)
  })

  it('422 pour un cycle, avec un pointeur vers managerId', async () => {
    const org = await createOrg()
    signInAs(org.hr)

    const body = await expectProblem(await assign(org.rootManager.id, { managerId: org.manager.id }), 422, 'invalid-input')

    expect(body.errors).toEqual([expect.objectContaining({ pointer: '#/managerId' })])
    expect(await getManagerId(org.rootManager.id)).toBeNull()
  })

  it('422 pour un manager d’une autre entreprise ; 404 pour une cible d’une autre entreprise (SEC-05)', async () => {
    const a = await createOrg('alpha')
    const b = await createOrg('beta')
    signInAs(a.hr)

    await expectProblem(await assign(a.employee.id, { managerId: b.manager.id }), 422, 'invalid-input')
    await expectProblem(await assign(b.employee.id, { managerId: a.manager.id }), 404, 'not-found')
  })

  it('400 pour un corps invalide, 403 hors RH', async () => {
    const org = await createOrg()
    signInAs(org.hr)
    const invalid = await expectProblem(await assign(org.employee.id, { managerId: 42 }), 400, 'invalid-request')
    expect(invalid.errors[0].pointer).toBe('#/managerId')

    signInAs(org.manager)
    await expectProblem(await assign(org.employee.id, { managerId: null }), 403, 'forbidden')
  })

  it('deux rattachements concurrents qui formeraient un cycle ne passent pas tous les deux', async () => {
    const org = await createOrg()
    const other = await createUser(org.companyId, 'manager')
    signInAs(org.hr)

    const responses = await Promise.all([
      assign(org.rootManager.id, { managerId: other.id }),
      assign(other.id, { managerId: org.rootManager.id }),
    ])

    expect(responses.map((r) => r.status).sort()).toEqual([200, 422])
  })
})
