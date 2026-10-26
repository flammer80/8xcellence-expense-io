import { describe, expect, it } from 'vitest'
import { DecideExpenseNote } from '@/application/DecideExpenseNote'
import { GetReceiptUrl } from '@/application/GetReceiptUrl'
import { ListPendingApprovals } from '@/application/ListPendingApprovals'
import { AlreadyDecidedError, ForbiddenError, InvalidInputError, NotFoundError } from '@/domain/errors'
import { InMemoryExpenseNoteRepository } from '@/infrastructure/in-memory/InMemoryExpenseNoteRepository'
import { InMemoryReceiptStorage } from '@/infrastructure/in-memory/InMemoryReceiptStorage'
import { InMemoryUserRepository } from '@/infrastructure/in-memory/InMemoryUserRepository'
import { aUser, anExpenseNote } from '../../helpers/builders'

const NOW = new Date('2026-10-26T09:00:00.000Z')

/** Une entreprise type, plus un RH d'une autre entreprise. */
function setup() {
  const users = new InMemoryUserRepository([
    aUser('hr', { role: 'hr_admin' }),
    aUser('root', { role: 'manager' }),
    aUser('manager', { role: 'manager', managerId: 'root' }),
    aUser('employee', { managerId: 'manager' }),
    aUser('newcomer'),
    aUser('foreign-hr', { role: 'hr_admin', companyId: 'globex' }),
  ])
  const notes = new InMemoryExpenseNoteRepository([
    anExpenseNote({ id: 'employee-note', userId: 'employee', createdAt: '2026-10-02T08:00:00Z' }),
    anExpenseNote({ id: 'employee-old-note', userId: 'employee', createdAt: '2026-10-01T08:00:00Z' }),
    anExpenseNote({ id: 'employee-done', userId: 'employee', status: 'approved' }),
    anExpenseNote({ id: 'root-note', userId: 'root' }),
    anExpenseNote({ id: 'newcomer-note', userId: 'newcomer' }),
    anExpenseNote({ id: 'hr-note', userId: 'hr' }),
  ])
  const receipts = new InMemoryReceiptStorage()
  return {
    notes,
    decide: new DecideExpenseNote(notes, users, () => NOW),
    listPending: new ListPendingApprovals(notes, users),
    getReceiptUrl: new GetReceiptUrl(notes, users, receipts),
  }
}

describe('DecideExpenseNote', () => {
  it('enregistre la décision du validateur désigné, avec qui, quand et le motif', async () => {
    const { decide, notes } = setup()

    const rejected = await decide.execute({
      noteId: 'employee-note',
      actorId: 'manager',
      decision: 'rejected',
      reason: 'Reçu illisible',
    })

    expect(rejected).toMatchObject({ status: 'rejected', decidedBy: 'manager', rejectionReason: 'Reçu illisible' })
    expect(rejected.decidedAt).toEqual(NOW)
    expect((await notes.findById('employee-note'))?.status).toBe('rejected')
  })

  it("débloque la note d'un employé sans manager : le RH la tranche", async () => {
    const { decide } = setup()
    const approved = await decide.execute({ noteId: 'newcomer-note', actorId: 'hr', decision: 'approved' })
    expect(approved.status).toBe('approved')
  })

  it('refuse un acteur qui n’est pas le validateur désigné (403) ou sa propre note', async () => {
    const { decide } = setup()
    await expect(decide.execute({ noteId: 'employee-note', actorId: 'root', decision: 'approved' })).rejects.toThrow(
      ForbiddenError
    )
    await expect(decide.execute({ noteId: 'hr-note', actorId: 'hr', decision: 'approved' })).rejects.toThrow(
      ForbiddenError
    )
  })

  it("cache une note d'une autre entreprise, ou inexistante (404)", async () => {
    const { decide } = setup()
    await expect(
      decide.execute({ noteId: 'root-note', actorId: 'foreign-hr', decision: 'approved' })
    ).rejects.toThrow(NotFoundError)
    await expect(decide.execute({ noteId: 'nope', actorId: 'hr', decision: 'approved' })).rejects.toThrow(
      NotFoundError
    )
  })

  it('refuse une seconde décision (409) sans modifier la première', async () => {
    const { decide, notes } = setup()
    await decide.execute({ noteId: 'root-note', actorId: 'hr', decision: 'approved' })

    await expect(decide.execute({ noteId: 'root-note', actorId: 'hr', decision: 'rejected' })).rejects.toThrow(
      AlreadyDecidedError
    )
    expect((await notes.findById('root-note'))?.status).toBe('approved')
  })

  it("vérifie l'autorisation avant l'état : une note tranchée hors de portée reste un 403, pas un 409", async () => {
    const { decide } = setup()
    await expect(
      decide.execute({ noteId: 'employee-done', actorId: 'root', decision: 'approved' })
    ).rejects.toThrow(ForbiddenError)
  })

  it('refuse un motif sur une approbation (422)', async () => {
    const { decide } = setup()
    await expect(
      decide.execute({ noteId: 'employee-note', actorId: 'manager', decision: 'approved', reason: 'ok' })
    ).rejects.toThrow(InvalidInputError)
  })
})

describe('ListPendingApprovals', () => {
  const ids = (items: { note: { id: string } }[]) => items.map((item) => item.note.id)

  it('donne au manager les notes en attente de ses subordonnés directs, les plus anciennes d’abord', async () => {
    expect(ids(await setup().listPending.execute({ actorId: 'manager' }))).toEqual([
      'employee-old-note',
      'employee-note',
    ])
  })

  it('donne au RH les notes des auteurs sans manager, sauf les siennes', async () => {
    expect(ids(await setup().listPending.execute({ actorId: 'hr' })).sort()).toEqual(['newcomer-note', 'root-note'])
  })

  it('donne le nom de l’auteur de chaque note, pour ne plus afficher un identifiant', async () => {
    const [first] = await setup().listPending.execute({ actorId: 'manager' })
    expect(first.author).toMatchObject({ id: 'employee', name: 'employee' })
  })

  it("ne donne rien à un employé, ni à un RH d'une autre entreprise", async () => {
    const { listPending } = setup()
    expect(await listPending.execute({ actorId: 'employee' })).toEqual([])
    expect(await listPending.execute({ actorId: 'foreign-hr' })).toEqual([])
  })
})

describe('GetReceiptUrl', () => {
  it("signe l'URL pour l'auteur et pour son validateur", async () => {
    const { getReceiptUrl } = setup()
    await expect(getReceiptUrl.execute({ noteId: 'employee-note', actorId: 'employee' })).resolves.toMatch(/^memory:/)
    await expect(getReceiptUrl.execute({ noteId: 'employee-note', actorId: 'manager' })).resolves.toMatch(/^memory:/)
  })

  it('répond « introuvable » à tout autre utilisateur, sans révéler que la note existe', async () => {
    const { getReceiptUrl } = setup()
    await expect(getReceiptUrl.execute({ noteId: 'employee-note', actorId: 'root' })).rejects.toThrow(NotFoundError)
    await expect(getReceiptUrl.execute({ noteId: 'root-note', actorId: 'foreign-hr' })).rejects.toThrow(NotFoundError)
  })
})
