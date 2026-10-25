import { describe, expect, it } from 'vitest'
import { GET, POST } from '@/app/api/expense-notes/route'
import { GET as getReceiptUrl } from '@/app/api/expense-notes/[id]/receipt-url/route'
import { POST as suggest } from '@/app/api/expense-notes/receipt-suggestion/route'
import { uploadReceipt } from '@/lib/storage'
import { suggestFields } from '@/lib/ocr'
import { createNote, createOrg } from '../helpers/factories'
import { noteForm, params, pngFile, request } from '../helpers/http'
import { signInAs, signOut } from '../helpers/session'

// Caractérisation : fige le comportement observable actuel des routes
// /api/expense-notes avant toute refacto (contrat à préserver, §9 CLAUDE.md).

describe('GET /api/expense-notes', () => {
  it('répond 401 sans session', async () => {
    signOut()
    const response = await GET(request('/api/expense-notes'))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it("ne renvoie que les notes de l'utilisateur, les plus récentes d'abord", async () => {
    const org = await createOrg()
    const older = await createNote(org.employee.id, { createdAt: '2026-10-01T10:00:00Z' })
    const newer = await createNote(org.employee.id, { createdAt: '2026-10-02T10:00:00Z' })
    await createNote(org.manager.id)
    signInAs(org.employee)

    const response = await GET(request('/api/expense-notes'))

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.map((note: { id: string }) => note.id)).toEqual([newer.id, older.id])
    expect(body[0]).toEqual({
      id: newer.id,
      userId: org.employee.id,
      amount: 10,
      expenseDate: '2026-10-01',
      description: expect.any(String),
      receiptKey: newer.receiptKey,
      status: 'pending',
      createdAt: '2026-10-02T10:00:00.000Z',
    })
  })
})

describe('POST /api/expense-notes', () => {
  it('crée la note, envoie le reçu et répond 201', async () => {
    const org = await createOrg()
    signInAs(org.employee)

    const response = await POST(request('/api/expense-notes', { method: 'POST', body: noteForm({}) }))

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toMatchObject({
      userId: org.employee.id,
      amount: 42.5,
      expenseDate: '2026-10-20',
      description: 'Taxi aéroport',
      status: 'pending',
    })
    expect(body.receiptKey).toMatch(/^receipts\/\d+\.png$/)
    expect(uploadReceipt).toHaveBeenCalledWith(body.receiptKey, expect.any(Buffer), 'image/png')
  })

  it('répond 401 sans session', async () => {
    signOut()
    const response = await POST(request('/api/expense-notes', { method: 'POST', body: noteForm({}) }))
    expect(response.status).toBe(401)
  })

  it.each([
    ['montant nul', { amount: '0' }],
    ['description vide', { description: '  ' }],
    ['reçu absent', { receipt: null }],
  ])('répond 400 si %s', async (_label, fields) => {
    const org = await createOrg()
    signInAs(org.employee)
    const response = await POST(
      request('/api/expense-notes', { method: 'POST', body: noteForm(fields) })
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Champs invalides' })
  })

  it('répond 400 pour un type de fichier non autorisé', async () => {
    const org = await createOrg()
    signInAs(org.employee)
    const form = noteForm({ receipt: pngFile('receipt.gif', 'image/gif') })
    const response = await POST(request('/api/expense-notes', { method: 'POST', body: form }))
    expect(response.status).toBe(400)
  })
})

describe('GET /api/expense-notes/{id}/receipt-url', () => {
  it("renvoie l'URL signée du reçu de sa propre note", async () => {
    const org = await createOrg()
    const note = await createNote(org.employee.id)
    signInAs(org.employee)

    const response = await getReceiptUrl(request(`/api/expense-notes/${note.id}/receipt-url`), params({ id: note.id }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ url: `https://s3.test/${note.receiptKey}?signed` })
  })

  it("répond 404 pour la note d'un autre utilisateur", async () => {
    const org = await createOrg()
    const note = await createNote(org.manager.id)
    signInAs(org.employee)

    const response = await getReceiptUrl(request(`/api/expense-notes/${note.id}/receipt-url`), params({ id: note.id }))

    expect(response.status).toBe(404)
  })
})

describe('POST /api/expense-notes/receipt-suggestion', () => {
  it('répond 401 sans session', async () => {
    signOut()
    const form = new FormData()
    form.set('receipt', pngFile())
    const response = await suggest(request('/api/expense-notes/receipt-suggestion', { method: 'POST', body: form }))
    expect(response.status).toBe(401)
  })

  it("répond 400 sans fichier, sinon renvoie la suggestion de l'OCR", async () => {
    const org = await createOrg()
    signInAs(org.employee)

    const empty = await suggest(
      request('/api/expense-notes/receipt-suggestion', { method: 'POST', body: new FormData() })
    )
    expect(empty.status).toBe(400)

    const ocr = suggestFields as unknown as { mockResolvedValueOnce: (value: unknown) => void }
    ocr.mockResolvedValueOnce({ amount: 12.3, expenseDate: '2026-10-05' })
    const form = new FormData()
    form.set('receipt', pngFile())
    const response = await suggest(request('/api/expense-notes/receipt-suggestion', { method: 'POST', body: form }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ amount: 12.3, expenseDate: '2026-10-05' })
  })
})
