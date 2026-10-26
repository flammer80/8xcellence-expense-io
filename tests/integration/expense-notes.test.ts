import { describe, expect, it } from 'vitest'
import { GET, POST } from '@/app/api/expense-notes/route'
import { GET as getReceiptUrl } from '@/app/api/expense-notes/[id]/receipt-url/route'
import { POST as suggest } from '@/app/api/expense-notes/receipt-suggestion/route'
import { deleteReceipt, uploadReceipt } from '@/lib/storage'
import { suggestFields } from '@/lib/ocr'
import { createNote, createOrg, getNotesOf } from '../helpers/factories'
import { noteForm, params, pngFile, request } from '../helpers/http'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
import { signInAs, signOut } from '../helpers/session'

// Caractérisation : fige le comportement observable actuel des routes
// /api/expense-notes avant toute refacto (contrat à préserver, §9 CLAUDE.md).

describe('GET /api/expense-notes', () => {
  it('répond 401 sans session', async () => {
    signOut()
    const response = await GET(request('/api/expense-notes'))
    expect(response.status).toBe(401)
    // RFC 9457, avec le membre historique `error` conservé (ADR 0008).
    expect(response.headers.get('Content-Type')).toBe('application/problem+json')
    expect(await response.json()).toMatchObject({
      type: 'https://expense.io/problems/unauthenticated',
      status: 401,
      error: 'Unauthorized',
    })
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
    // La clé de stockage n'est plus exposée (ADR 0008). En base, elle reste
    // opaque et préfixée par l'entreprise (ADR 0006).
    expect(body).not.toHaveProperty('receiptKey')
    expect(body.id).toMatch(new RegExp(`^${UUID}$`))
    expect(response.headers.get('Location')).toBe(`/api/expense-notes/${body.id}`)
    const receiptKey = `receipts/${org.companyId}/${body.id}.png`
    expect(uploadReceipt).toHaveBeenCalledWith(receiptKey, expect.any(Buffer), 'image/png')
    expect(await getNotesOf(org.employee.id)).toEqual([
      { id: body.id, company_id: org.companyId, receipt_key: receiptKey },
    ])
  })

  it("ne crée aucune note si l'envoi du reçu échoue (ARC-06)", async () => {
    const org = await createOrg()
    signInAs(org.employee)
    const upload = uploadReceipt as unknown as { mockRejectedValueOnce: (error: Error) => void }
    upload.mockRejectedValueOnce(new Error('S3 indisponible'))

    const response = await POST(request('/api/expense-notes', { method: 'POST', body: noteForm({}) }))

    expect(response.status).toBe(500)
    expect(await getNotesOf(org.employee.id)).toEqual([])
    expect(deleteReceipt).not.toHaveBeenCalled()
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
    expect(await response.json()).toMatchObject({ error: 'Champs invalides' })
  })

  it.each([
    ['mois inexistant', '2026-13-45'],
    ['format libre', 'hier'],
  ])('répond 400 si la date est invalide (%s)', async (_label, expenseDate) => {
    const org = await createOrg()
    signInAs(org.employee)
    const response = await POST(
      request('/api/expense-notes', { method: 'POST', body: noteForm({ expenseDate }) })
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'Champs invalides' })
    expect(uploadReceipt).not.toHaveBeenCalled()
  })

  it.each([
    ['un PDF', '%PDF-1.7\n%âãÏÓ'],
    ['du texte', 'pas une image du tout'],
  ])('répond 400 si le contenu est %s déclaré comme PNG (S9)', async (_label, content) => {
    const org = await createOrg()
    signInAs(org.employee)
    const fake = new File([Buffer.from(content)], 'receipt.png', { type: 'image/png' })
    const response = await POST(
      request('/api/expense-notes', { method: 'POST', body: noteForm({ receipt: fake }) })
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'Type de fichier non autorisé pour le reçu' })
    expect(await getNotesOf(org.employee.id)).toEqual([])
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
