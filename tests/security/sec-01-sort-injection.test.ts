import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/expense-notes/route'
import { createNote, createOrg } from '../helpers/factories'
import { request } from '../helpers/http'
import { signInAs } from '../helpers/session'

// SEC-01 (audit v2) : le paramètre `sort` était concaténé dans ORDER BY.

const ids = (body: Array<{ id: string }>) => body.map((note) => note.id)

describe('SEC-01 — injection SQL via ?sort=', () => {
  it("n'exécute pas une expression SQL passée dans sort", async () => {
    const org = await createOrg()
    await createNote(org.employee.id)
    signInAs(org.employee)

    // Avant correctif : Postgres évalue 1/0 → 500 « division by zero »,
    // preuve que le SQL injecté est exécuté.
    const response = await GET(request(`/api/expense-notes?sort=${encodeURIComponent('(SELECT 1/0)')}`))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid sort' })
  })

  it('refuse une sous-requête qui lit une autre table', async () => {
    const org = await createOrg()
    signInAs(org.employee)
    const payload = '(SELECT password_hash FROM users LIMIT 1)'

    const response = await GET(request(`/api/expense-notes?sort=${encodeURIComponent(payload)}`))

    expect(response.status).toBe(400)
  })

  it('accepte toujours les tris légitimes (colonne et sens)', async () => {
    const org = await createOrg()
    const small = await createNote(org.employee.id, { amount: 5, createdAt: '2026-10-02T00:00:00Z' })
    const big = await createNote(org.employee.id, { amount: 50, createdAt: '2026-10-01T00:00:00Z' })
    signInAs(org.employee)

    const byAmount = await GET(request(`/api/expense-notes?sort=${encodeURIComponent('amount DESC')}`))
    expect(byAmount.status).toBe(200)
    expect(ids(await byAmount.json())).toEqual([big.id, small.id])

    const byDate = await GET(request(`/api/expense-notes?sort=${encodeURIComponent('created_at asc')}`))
    expect(ids(await byDate.json())).toEqual([big.id, small.id])

    const columnOnly = await GET(request('/api/expense-notes?sort=amount'))
    expect(ids(await columnOnly.json())).toEqual([small.id, big.id])
  })
})
