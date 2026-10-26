import { describe, expect, it } from 'vitest'
import { ApprovalPolicy } from '@/domain/ApprovalPolicy'
import { ForbiddenError, NotFoundError } from '@/domain/errors'
import { aUser } from '../../helpers/builders'

// Un test par règle de CLAUDE.md §3 et par cas tranché dans l'ADR 0003.

const hr = aUser('hr', { role: 'hr_admin' })
const otherHr = aUser('hr-2', { role: 'hr_admin' })
const rootManager = aUser('root', { role: 'manager' })
const manager = aUser('manager', { role: 'manager', managerId: 'root' })
const employee = aUser('employee', { managerId: 'manager' })
const unassigned = aUser('newcomer')
const foreignHr = aUser('foreign-hr', { role: 'hr_admin', companyId: 'globex' })
const foreignManager = aUser('foreign-manager', { role: 'manager', companyId: 'globex' })

describe('ApprovalPolicy — qui tranche quelle note', () => {
  it("règle 2 : le manager direct tranche la note de son subordonné", () => {
    expect(ApprovalPolicy.refusalToDecide(manager, employee)).toBeNull()
  })

  it("règle 2 : un manager ne tranche pas la note d'un subordonné indirect", () => {
    expect(ApprovalPolicy.refusalToDecide(rootManager, employee)).toBe('not-approver')
  })

  it("règle 2 : le RH ne court-circuite pas le manager direct", () => {
    expect(ApprovalPolicy.refusalToDecide(hr, employee)).toBe('not-approver')
  })

  it('règle 3 : le RH tranche la note d’un manager racine', () => {
    expect(ApprovalPolicy.refusalToDecide(hr, rootManager)).toBeNull()
  })

  it("règle 3 : un autre manager ne tranche pas la note d'un manager racine", () => {
    expect(ApprovalPolicy.refusalToDecide(manager, rootManager)).toBe('not-approver')
  })

  it('cas tranché : un employé sans manager est traité comme un manager racine', () => {
    expect(ApprovalPolicy.refusalToDecide(hr, unassigned)).toBeNull()
    expect(ApprovalPolicy.refusalToDecide(rootManager, unassigned)).toBe('not-approver')
  })

  it("cas tranché : la note d'un RH revient à un autre RH de l'entreprise", () => {
    expect(ApprovalPolicy.refusalToDecide(otherHr, hr)).toBeNull()
    expect(ApprovalPolicy.refusalToDecide(rootManager, hr)).toBe('not-approver')
  })

  it.each([
    ['un manager', manager],
    ['un RH', hr],
    ['un manager racine', rootManager],
  ])('règle 4 : %s ne tranche pas sa propre note', (_label, actor) => {
    expect(ApprovalPolicy.refusalToDecide(actor, actor)).toBe('own-note')
  })

  it("cas tranché : un RH seul dans l'entreprise ne peut pas trancher sa note (elle reste en attente)", () => {
    const colleagues = [hr, rootManager, manager, employee, unassigned]
    expect(colleagues.filter((actor) => ApprovalPolicy.canDecide(actor, hr))).toEqual([])
  })

  it('règle 7 : rien ne traverse les entreprises, même pour un RH ou un manager mal rattaché', () => {
    expect(ApprovalPolicy.refusalToDecide(foreignHr, rootManager)).toBe('other-company')
    const crossCompanyEmployee = aUser('victim', { managerId: 'foreign-manager' })
    expect(ApprovalPolicy.refusalToDecide(foreignManager, crossCompanyEmployee)).toBe('other-company')
  })

  it("un employé ne tranche jamais, même la note d'un collègue sans manager", () => {
    expect(ApprovalPolicy.refusalToDecide(employee, unassigned)).toBe('not-approver')
  })
})

describe('ApprovalPolicy.assertCanDecide', () => {
  it('cache l’existence d’une note d’une autre entreprise (404)', () => {
    expect(() => ApprovalPolicy.assertCanDecide(foreignHr, rootManager, 'n1')).toThrow(NotFoundError)
  })

  it("refuse explicitement dans la même entreprise (403)", () => {
    expect(() => ApprovalPolicy.assertCanDecide(hr, hr, 'n1')).toThrow(ForbiddenError)
    expect(() => ApprovalPolicy.assertCanDecide(rootManager, employee, 'n1')).toThrow(ForbiddenError)
  })

  it('laisse passer le validateur désigné', () => {
    expect(() => ApprovalPolicy.assertCanDecide(manager, employee, 'n1')).not.toThrow()
  })
})

describe('ApprovalPolicy.canViewReceipt', () => {
  it("l'auteur et son validateur voient le reçu, personne d'autre", () => {
    expect(ApprovalPolicy.canViewReceipt(employee, employee)).toBe(true)
    expect(ApprovalPolicy.canViewReceipt(manager, employee)).toBe(true)
    expect(ApprovalPolicy.canViewReceipt(rootManager, employee)).toBe(false)
    expect(ApprovalPolicy.canViewReceipt(foreignHr, rootManager)).toBe(false)
  })
})
