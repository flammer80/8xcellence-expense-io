import { describe, expect, it } from 'vitest'
import { getPool, withUserScope } from '@/lib/db'
import { createNote, createOrg, createUser } from '../helpers/factories'

// SEC-03 : l'isolation entre entreprises ne doit pas reposer sur les `WHERE`
// écrits à la main. L'application se connecte avec un rôle soumis à la RLS ;
// ces tests lancent volontairement des requêtes sans filtre, comme une route
// qui l'aurait oublié (ADR 0005).

/** Ce qu'un utilisateur voit des 3 tables avec un `SELECT` sans `WHERE`. */
async function visibleRowsFor(userId: string) {
  return withUserScope(userId, async (client) => ({
    companies: (await client.query<{ id: string }>('SELECT id FROM companies')).rows.map((r) => r.id),
    userCompanies: (await client.query<{ company_id: string }>('SELECT company_id FROM users')).rows.map(
      (r) => r.company_id
    ),
    noteIds: (await client.query<{ id: string }>('SELECT id FROM expense_notes')).rows.map((r) => r.id),
  }))
}

describe("SEC-03 — rôle de connexion de l'application", () => {
  it("n'est ni superutilisateur ni BYPASSRLS", async () => {
    const result = await getPool().query(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
    )
    expect(result.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false })
  })

  it('ne lit pas les hash de mots de passe', async () => {
    const org = await createOrg()
    await expect(
      withUserScope(org.hr.id, (client) => client.query('SELECT password_hash FROM users'))
    ).rejects.toThrow(/permission denied/)
  })
})

describe('SEC-03 — isolation entre deux entreprises, sans WHERE', () => {
  it("aucun rôle de l'entreprise A ne voit une ligne de B, sur les 3 tables", async () => {
    const a = await createOrg('alpha')
    const b = await createOrg('beta')
    const aNote = await createNote(a.employee.id)
    await createNote(b.employee.id)
    await createNote(b.rootManager.id)

    for (const actor of [a.hr, a.rootManager, a.manager, a.employee]) {
      const visible = await visibleRowsFor(actor.id)
      expect(visible.companies).toEqual([a.companyId])
      expect(new Set(visible.userCompanies)).toEqual(new Set([a.companyId]))
      expect(visible.noteIds.every((id) => id === aNote.id)).toBe(true)
    }
  })

  it('hors contexte utilisateur, aucune ligne ne remonte', async () => {
    const a = await createOrg('alpha')
    await createNote(a.employee.id)

    const notes = await getPool().query('SELECT id FROM expense_notes')
    const users = await getPool().query('SELECT id FROM users')

    expect(notes.rowCount).toBe(0)
    expect(users.rowCount).toBe(0)
  })

  it("refuse une note insérée au nom d'une autre entreprise", async () => {
    const a = await createOrg('alpha')
    const b = await createOrg('beta')
    await expect(
      withUserScope(a.employee.id, (client) =>
        client.query(
          `INSERT INTO expense_notes (user_id, company_id, amount, expense_date, description, receipt_key)
           VALUES ($1, $2, 10, '2026-10-01', 'x', 'k')`,
          [a.employee.id, b.companyId]
        )
      )
    ).rejects.toThrow()
  })

  it("refuse une note insérée au nom d'un autre utilisateur", async () => {
    const a = await createOrg('alpha')
    await expect(
      withUserScope(a.employee.id, (client) =>
        client.query(
          `INSERT INTO expense_notes (user_id, company_id, amount, expense_date, description, receipt_key)
           VALUES ($1, $2, 10, '2026-10-01', 'x', 'k')`,
          [a.manager.id, a.companyId]
        )
      )
    ).rejects.toThrow(/row-level security/)
  })

  it("un RH ne peut pas rattacher un salarié d'une autre entreprise", async () => {
    const a = await createOrg('alpha')
    const b = await createOrg('beta')
    const result = await withUserScope(a.hr.id, (client) =>
      client.query('UPDATE users SET manager_id = $1 WHERE id = $2', [a.manager.id, b.employee.id])
    )
    expect(result.rowCount).toBe(0)
  })
})

describe("SEC-03 — visibilité à l'intérieur d'une entreprise", () => {
  it("un employé ne voit que ses propres notes, pas celles d'un collègue", async () => {
    const org = await createOrg()
    const colleague = await createUser(org.companyId, 'employee', { managerId: org.manager.id })
    const own = await createNote(org.employee.id)
    await createNote(colleague.id)

    expect((await visibleRowsFor(org.employee.id)).noteIds).toEqual([own.id])
  })

  it('un manager voit ses notes et celles de ses subordonnés directs, pas au-delà', async () => {
    const org = await createOrg()
    const own = await createNote(org.manager.id)
    const subordinate = await createNote(org.employee.id)
    await createNote(org.rootManager.id)

    const visible = (await visibleRowsFor(org.manager.id)).noteIds
    expect(new Set(visible)).toEqual(new Set([own.id, subordinate.id]))
  })

  it('un RH voit toutes les notes de son entreprise', async () => {
    const org = await createOrg()
    const notes = [await createNote(org.employee.id), await createNote(org.rootManager.id)]

    const visible = (await visibleRowsFor(org.hr.id)).noteIds
    expect(new Set(visible)).toEqual(new Set(notes.map((n) => n.id)))
  })

  it('personne ne peut trancher sa propre note, même en SQL direct', async () => {
    const org = await createOrg()
    const note = await createNote(org.hr.id)
    const result = await withUserScope(org.hr.id, (client) =>
      client.query(
        "UPDATE expense_notes SET status = 'approved', decided_by = $2, decided_at = now() WHERE id = $1",
        [note.id, org.hr.id]
      )
    )
    expect(result.rowCount).toBe(0)
  })

  it('une décision ne peut pas être attribuée à quelqu’un d’autre', async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    await expect(
      withUserScope(org.manager.id, (client) =>
        client.query(
          "UPDATE expense_notes SET status = 'approved', decided_by = $2, decided_at = now() WHERE id = $1",
          [note.id, org.hr.id]
        )
      )
    ).rejects.toThrow(/row-level security/)
  })

  it("aucune note ne peut être supprimée par l'application", async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    await expect(
      withUserScope(org.employee.id, (client) => client.query('DELETE FROM expense_notes WHERE id = $1', [note.id]))
    ).rejects.toThrow(/permission denied/)
  })
})
