import { auth } from '@/lib/auth'
import { getPool } from '@/lib/db'
import { respondError } from '@/lib/errors'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user || session.user.role !== 'hr_admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }
    const { id } = await params
    const body = (await request.json().catch(() => null)) as { managerId?: string | null } | null
    const managerId = body?.managerId ?? null

    const hrAdminResult = await getPool().query('SELECT company_id FROM users WHERE id = $1', [
      session.user.id,
    ])
    const companyId = hrAdminResult.rows[0]?.company_id
    if (!companyId) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    const targetResult = await getPool().query(
      `SELECT id FROM users WHERE id = $1 AND company_id = $2 AND role IN ('employee', 'manager')`,
      [id, companyId]
    )
    if (!targetResult.rows[0]) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }

    if (managerId !== null) {
      if (managerId === id) {
        return Response.json({ error: 'Invalid manager' }, { status: 409 })
      }
      // Le manager choisi doit avoir le rôle manager et appartenir à la même
      // entreprise : l'annuaire de l'UI ne protège pas l'API (SEC-05).
      const managerResult = await getPool().query(
        `SELECT id FROM users WHERE id = $1 AND role = 'manager' AND company_id = $2`,
        [managerId, companyId]
      )
      if (!managerResult.rows[0]) {
        return Response.json({ error: 'Invalid manager' }, { status: 409 })
      }

      // Refuse tout cycle : la cible ne doit pas figurer parmi les
      // supérieurs du manager choisi. UNION (et non UNION ALL) garantit que
      // la remontée s'arrête même si un cycle existe déjà en base.
      const cycleResult = await getPool().query(
        `WITH RECURSIVE chain AS (
           SELECT id, manager_id FROM users WHERE id = $1
           UNION
           SELECT u.id, u.manager_id FROM users u JOIN chain c ON u.id = c.manager_id
         )
         SELECT 1 FROM chain WHERE id = $2 LIMIT 1`,
        [managerId, id]
      )
      if (cycleResult.rows[0]) {
        return Response.json({ error: 'Invalid manager' }, { status: 409 })
      }
    }

    const updated = await getPool().query(
      `UPDATE users SET manager_id = $1 WHERE id = $2
       RETURNING id, name, email, role, manager_id`,
      [managerId, id]
    )
    const user = updated.rows[0]
    return Response.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      managerId: user.manager_id,
    })
  } catch (error) {
    return respondError(error)
  }
}
