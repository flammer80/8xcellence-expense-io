import { describe, expect, it } from 'vitest'
import { ForbiddenError, InvalidInputError, NotFoundError } from '@/domain/errors'
import { ManagerAssignment } from '@/domain/ManagerAssignment'
import { aUser } from '../../helpers/builders'

// Règle n°6 : le RH rattache, dans son entreprise, sans cycle.
const hr = aUser('hr', { role: 'hr_admin' })
const directory = [
  hr,
  aUser('root', { role: 'manager' }),
  aUser('manager', { role: 'manager', managerId: 'root' }),
  aUser('employee', { managerId: 'manager' }),
  aUser('other-hr', { role: 'hr_admin' }),
  aUser('foreign-manager', { role: 'manager', companyId: 'globex' }),
]

const apply = (targetId: string, managerId: string | null, actor = hr) =>
  ManagerAssignment.apply(actor, targetId, managerId, directory)

describe('ManagerAssignment', () => {
  it('rattache un employé à un manager de l’entreprise', () => {
    expect(apply('employee', 'root')).toMatchObject({ id: 'employee', managerId: 'root' })
  })

  it('détache un utilisateur (il devient racine)', () => {
    expect(apply('manager', null).managerId).toBeNull()
  })

  it('refuse un acteur qui n’est pas RH', () => {
    expect(() => apply('employee', 'root', directory[1])).toThrow(ForbiddenError)
  })

  it('ne connaît pas une cible RH ou d’une autre entreprise (404)', () => {
    expect(() => apply('other-hr', 'root')).toThrow(NotFoundError)
    expect(() => apply('foreign-manager', 'root')).toThrow(NotFoundError)
  })

  it.each([
    ['un manager d’une autre entreprise (SEC-05)', 'employee', 'foreign-manager'],
    ['un employé', 'manager', 'employee'],
    ['soi-même', 'root', 'root'],
    ['son propre subordonné direct (A → B → A)', 'manager', 'employee'],
    ['un subordonné indirect (cycle plus long)', 'root', 'manager'],
  ])('refuse comme manager %s', (_label, targetId, managerId) => {
    expect(() => apply(targetId, managerId)).toThrow(InvalidInputError)
  })

  it('s’arrête même si un cycle existe déjà en base', () => {
    const corrupted = [hr, aUser('a', { role: 'manager', managerId: 'b' }), aUser('b', { role: 'manager', managerId: 'a' }), aUser('c', { role: 'manager' })]
    expect(ManagerAssignment.apply(hr, 'c', 'a', corrupted).managerId).toBe('a')
  })
})
