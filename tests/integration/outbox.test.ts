import { describe, expect, it, vi } from 'vitest'
import { POST as decide } from '@/app/api/expense-notes/[id]/decision/route'
import { POST as submitNote } from '@/app/api/expense-notes/route'
import { POST as legacyManagerReject } from '@/app/api/manager/expense-notes/[id]/reject/route'
import { GET as listNotifications } from '@/app/api/notifications/route'
import { getWorkerPool, withUserScope } from '@/lib/db'
import { deleteReceipt } from '@/lib/storage'
import { createNote, createOrg } from '../helpers/factories'
import { jsonRequest, noteForm, params, request } from '../helpers/http'
import { drainOutbox, outboxRows } from '../helpers/outbox'
import { ownerPool } from '../helpers/owner-pool'
import { signInAs, signOut } from '../helpers/session'

// Étape 5 (ADR 0007) : les événements sont écrits dans l'outbox dans la même
// transaction que la note, puis le worker prévient l'auteur.

const decideAs = (id: string, body: unknown, headers: Record<string, string> = {}) =>
  decide(
    request(`/api/expense-notes/${id}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    params({ id })
  )

describe('outbox — un événement par changement d’état, jamais pour une transaction annulée', () => {
  it('la soumission d’une note écrit ExpenseNoteSubmitted, avec l’entreprise de l’auteur', async () => {
    const org = await createOrg()
    signInAs(org.employee)

    const response = await submitNote(request('/api/expense-notes', { method: 'POST', body: noteForm({}) }))

    expect(response.status).toBe(201)
    const { id } = await response.json()
    const [event] = await outboxRows()
    expect(event).toMatchObject({
      type: 'ExpenseNoteSubmitted',
      version: 1,
      company_id: org.companyId,
      payload: { noteId: id, authorId: org.employee.id, amount: 42.5 },
      processed_at: null,
    })
  })

  it('une décision écrit ExpenseNoteDecided, avec l’id de corrélation de la requête', async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.manager)

    const response = await decideAs(note.id, { decision: 'rejected', reason: 'Doublon' }, {
      'X-Correlation-Id': 'trace-abc-123',
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Correlation-Id')).toBe('trace-abc-123')
    expect(await outboxRows()).toEqual([
      expect.objectContaining({
        type: 'ExpenseNoteDecided',
        correlation_id: 'trace-abc-123',
        payload: expect.objectContaining({ noteId: note.id, decision: 'rejected', rejectionReason: 'Doublon' }),
      }),
    ])
  })

  it('une double décision (409) ne publie rien de plus', async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.manager)
    await decideAs(note.id, { decision: 'approved' })

    const second = await decideAs(note.id, { decision: 'rejected' })

    expect(second.status).toBe(409)
    expect(await outboxRows()).toHaveLength(1)
  })

  it('si l’écriture de la note échoue, aucun événement n’est publié (rollback)', async () => {
    const org = await createOrg()
    signInAs(org.employee)
    // Panne simulée au milieu de la transaction, après l'INSERT de la note.
    const outbox = await import('@/infrastructure/postgres/outbox')
    const spy = vi.spyOn(outbox, 'insertOutboxMessages').mockRejectedValueOnce(new Error('panne'))

    const response = await submitNote(request('/api/expense-notes', { method: 'POST', body: noteForm({}) }))

    expect(response.status).toBe(500)
    spy.mockRestore()
    // La compensation de l'ADR 0006 a supprimé le reçu déposé.
    expect(deleteReceipt).toHaveBeenCalledTimes(1)
    expect(await outboxRows()).toEqual([])
    const notes = await ownerPool().query('SELECT id FROM expense_notes')
    expect(notes.rowCount).toBe(0)
  })
})

describe('notification de l’auteur (consommateur de ExpenseNoteDecided)', () => {
  it('après le passage du worker, l’employé voit la décision dans ses notifications', async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id, { description: 'Taxi' })
    signInAs(org.manager)
    await decideAs(note.id, { decision: 'rejected', reason: 'Hors politique' })

    await drainOutbox()

    signInAs(org.employee)
    const response = await listNotifications()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      expect.objectContaining({
        noteId: note.id,
        noteDescription: 'Taxi',
        decision: 'rejected',
        rejectionReason: 'Hors politique',
      }),
    ])
    const [event] = await outboxRows()
    expect(event.processed_at).toBeInstanceOf(Date)
  })

  it('les anciennes routes approve/reject notifient aussi (même cas d’usage)', async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.manager)
    const legacy = await legacyManagerReject(
      jsonRequest(`/api/manager/expense-notes/${note.id}/reject`, 'POST', {}),
      params({ id: note.id })
    )
    expect(legacy.status).toBe(200)

    await drainOutbox()

    signInAs(org.employee)
    expect(await (await listNotifications()).json()).toHaveLength(1)
  })

  it('un événement rejoué (worker planté avant l’ack) ne crée pas de seconde notification', async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.manager)
    await decideAs(note.id, { decision: 'approved' })
    await drainOutbox()

    await ownerPool().query('UPDATE outbox SET processed_at = NULL')
    await drainOutbox()

    const count = await ownerPool().query('SELECT count(*)::int AS n FROM notifications')
    expect(count.rows[0].n).toBe(1)
  })

  it('personne d’autre ne voit la notification, et un visiteur reçoit 401', async () => {
    const org = await createOrg()
    const other = await createOrg('other')
    const note = await createNote(org.employee.id)
    signInAs(org.manager)
    await decideAs(note.id, { decision: 'approved' })
    await drainOutbox()

    for (const user of [org.manager, org.hr, other.employee]) {
      signInAs(user)
      expect(await (await listNotifications()).json()).toEqual([])
    }
    signOut()
    expect((await listNotifications()).status).toBe(401)
  })
})

describe('outbox — moindre privilège des rôles (RLS)', () => {
  it("l'application écrit dans l'outbox mais ne peut pas la relire", async () => {
    const org = await createOrg()
    await expect(
      withUserScope(org.employee.id, (client) => client.query('SELECT * FROM outbox'))
    ).rejects.toThrow(/permission denied/)
  })

  it("l'application ne peut pas publier un message au nom d'une autre entreprise", async () => {
    const a = await createOrg('alpha')
    const b = await createOrg('beta')
    await expect(
      withUserScope(a.employee.id, (client) =>
        client.query(
          `INSERT INTO outbox (id, company_id, type, version, payload, occurred_at)
           VALUES (gen_random_uuid(), $1, 'ExpenseNoteDecided', 1, '{}', now())`,
          [b.companyId]
        )
      )
    ).rejects.toThrow(/row-level security/)
  })

  it("le worker n'est ni superutilisateur ni BYPASSRLS, et ne lit aucune donnée métier", async () => {
    const roles = await getWorkerPool().query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user')
    expect(roles.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false })
    for (const table of ['expense_notes', 'users', 'notifications', 'receipt_suggestions']) {
      await expect(getWorkerPool().query(`SELECT 1 FROM ${table}`)).rejects.toThrow(/permission denied/)
    }
  })

  it("le worker ne peut pas modifier le contenu d'un message, seulement son état de livraison", async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.manager)
    await decideAs(note.id, { decision: 'approved' })

    await expect(getWorkerPool().query(`UPDATE outbox SET payload = '{}'`)).rejects.toThrow(/permission denied/)
  })
})
