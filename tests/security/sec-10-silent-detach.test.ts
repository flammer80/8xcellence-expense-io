import { describe, expect, it } from 'vitest'
import { PUT as legacyAssign } from '@/app/api/hr/users/[id]/manager/route'
import { PUT as assign } from '@/app/api/users/[id]/manager/route'
import { createOrg, getManagerId } from '../helpers/factories'
import { jsonRequest, params } from '../helpers/http'
import { signInAs } from '../helpers/session'

// SEC-10 (audit v2) : un corps absent ou mal formé détachait l'employé de son
// manager, sans erreur visible. Seul `{ "managerId": null }` détache.

describe('SEC-10 — détachement silencieux du manager', () => {
  it.each([
    ['corps vide', undefined],
    ['managerId absent', {}],
    ['managerId non textuel', { managerId: 42 }],
  ])('%s : 400 et rattachement inchangé (ancienne et nouvelle route)', async (_label, body) => {
    const org = await createOrg()
    signInAs(org.hr)

    for (const [route, path] of [
      [legacyAssign, `/api/hr/users/${org.employee.id}/manager`],
      [assign, `/api/users/${org.employee.id}/manager`],
    ] as const) {
      const response = await route(jsonRequest(path, 'PUT', body), params({ id: org.employee.id }))
      expect(response.status).toBe(400)
    }
    expect(await getManagerId(org.employee.id)).toBe(org.manager.id)
  })
})
