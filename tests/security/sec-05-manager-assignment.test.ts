import { describe, expect, it } from 'vitest'
import { PUT } from '@/app/api/hr/users/[id]/manager/route'
import { createOrg, createUser, getManagerId } from '../helpers/factories'
import { jsonRequest, params } from '../helpers/http'
import { signInAs } from '../helpers/session'

// SEC-05 (audit v2) : le manager choisi n'était filtré ni par entreprise, ni
// contre les cycles hiérarchiques.

const assign = (userId: string, managerId: string) =>
  PUT(jsonRequest(`/api/hr/users/${userId}/manager`, 'PUT', { managerId }), params({ id: userId }))

describe('SEC-05 — rattachement de manager', () => {
  it("refuse un manager d'une autre entreprise", async () => {
    const org = await createOrg('acme')
    const other = await createOrg('globex')
    signInAs(org.hr)

    const response = await assign(org.employee.id, other.rootManager.id)

    expect(response.status).toBe(409)
    expect(await getManagerId(org.employee.id)).toBe(org.manager.id)
  })

  it('refuse un cycle direct (A manage B et B manage A)', async () => {
    const org = await createOrg()
    signInAs(org.hr)

    // org.manager est déjà rattaché à org.rootManager.
    const response = await assign(org.rootManager.id, org.manager.id)

    expect(response.status).toBe(409)
    expect(await getManagerId(org.rootManager.id)).toBeNull()
  })

  it('refuse un cycle plus long (A → B → C → A)', async () => {
    const org = await createOrg()
    const top = await createUser(org.companyId, 'manager')
    const middle = await createUser(org.companyId, 'manager', { managerId: top.id })
    const bottom = await createUser(org.companyId, 'manager', { managerId: middle.id })
    signInAs(org.hr)

    const response = await assign(top.id, bottom.id)

    expect(response.status).toBe(409)
    expect(await getManagerId(top.id)).toBeNull()
  })

  it('accepte toujours un rattachement sans cycle dans la même entreprise', async () => {
    const org = await createOrg()
    const other = await createUser(org.companyId, 'manager')
    signInAs(org.hr)

    const response = await assign(org.manager.id, other.id)

    expect(response.status).toBe(200)
    expect(await getManagerId(org.manager.id)).toBe(other.id)
  })
})
