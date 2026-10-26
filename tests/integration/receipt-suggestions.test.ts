import { describe, expect, it, vi } from 'vitest'
import { POST as legacySuggest } from '@/app/api/expense-notes/receipt-suggestion/route'
import { GET as getSuggestion } from '@/app/api/receipt-suggestions/[id]/route'
import { POST as requestSuggestion } from '@/app/api/receipt-suggestions/route'
import { recognizeReceipt } from '@/lib/ocr'
import { deleteReceipt, uploadReceipt } from '@/lib/storage'
import { createOrg } from '../helpers/factories'
import { params, pngFile, request } from '../helpers/http'
import { drainOutbox, makeOutboxReady, outboxRows } from '../helpers/outbox'
import { signInAs, signOut } from '../helpers/session'

// OCR asynchrone (ADR 0007) : 202 + Location, puis polling jusqu'à un état
// final. Tesseract est simulé (`recognizeReceipt`, integration-setup.ts).

const mockedRecognize = vi.mocked(recognizeReceipt)

function upload(file: File | null = pngFile()) {
  const form = new FormData()
  if (file) form.set('receipt', file)
  return requestSuggestion(request('/api/receipt-suggestions', { method: 'POST', body: form }))
}

async function poll(location: string) {
  const id = location.split('/').pop() as string
  return getSuggestion(request(location), params({ id }))
}

describe('POST /api/receipt-suggestions puis GET (polling)', () => {
  it('répond 202 tout de suite, sans lancer l’OCR dans la requête', async () => {
    const org = await createOrg()
    signInAs(org.employee)

    const response = await upload()

    expect(response.status).toBe(202)
    const location = response.headers.get('Location')
    expect(location).toMatch(/^\/api\/receipt-suggestions\/[0-9a-f-]{36}$/)
    expect(await response.json()).toMatchObject({ status: 'pending', completedAt: null })
    expect(mockedRecognize).not.toHaveBeenCalled()
    expect(uploadReceipt).toHaveBeenCalledWith(expect.stringMatching(/^ocr\//), expect.any(Buffer), 'image/png')
    expect(await outboxRows()).toEqual([expect.objectContaining({ type: 'ReceiptOcrRequested' })])

    const pending = await poll(location as string)
    expect(pending.status).toBe(200)
    expect(pending.headers.get('Retry-After')).toBe('1')
    expect(await pending.json()).toMatchObject({ status: 'pending' })
  })

  it('après le passage du worker, le polling renvoie les champs reconnus', async () => {
    const org = await createOrg()
    signInAs(org.employee)
    mockedRecognize.mockResolvedValueOnce({ amount: 23.9, expenseDate: '2026-10-12' })
    const location = (await upload()).headers.get('Location') as string

    await drainOutbox()

    const response = await poll(location)
    expect(await response.json()).toMatchObject({ status: 'done', amount: 23.9, expenseDate: '2026-10-12' })
    expect(response.headers.get('Retry-After')).toBeNull()
    expect(deleteReceipt).toHaveBeenCalledWith(expect.stringMatching(/^ocr\//))
  })

  it('une panne répétée de l’OCR finit en lettre morte et en statut `failed`', async () => {
    const org = await createOrg()
    signInAs(org.employee)
    mockedRecognize.mockRejectedValue(new Error('Tesseract a planté'))
    const location = (await upload()).headers.get('Location') as string

    for (let attempt = 0; attempt < 5; attempt++) {
      await drainOutbox()
      await makeOutboxReady()
    }
    mockedRecognize.mockReset()

    expect(await (await poll(location)).json()).toMatchObject({ status: 'failed' })
    const [job] = await outboxRows()
    expect(job).toMatchObject({ attempts: 5, last_error: 'Tesseract a planté' })
    expect(job.dead_at).toBeInstanceOf(Date)
  })

  it('refuse sans session (401), sans fichier (400) et un faux PNG (422), au format RFC 9457', async () => {
    const org = await createOrg()
    signOut()
    expect((await upload()).status).toBe(401)

    signInAs(org.employee)
    const missing = await upload(null)
    expect(missing.status).toBe(400)
    expect(missing.headers.get('Content-Type')).toBe('application/problem+json')

    const fake = await upload(new File([Buffer.from('%PDF-1.7 pas une image')], 'r.png', { type: 'image/png' }))
    expect(fake.status).toBe(422)
    expect(await fake.json()).toMatchObject({ errors: [{ pointer: '#/receipt.type' }] })
    expect(await outboxRows()).toEqual([])
  })

  it('une demande n’est visible que de son auteur, même dans la même entreprise (404)', async () => {
    const org = await createOrg()
    signInAs(org.employee)
    const location = (await upload()).headers.get('Location') as string

    signInAs(org.hr)
    expect((await poll(location)).status).toBe(404)
  })
})

describe('POST /api/expense-notes/receipt-suggestion (déprécié, synchrone)', () => {
  it('reste disponible, marqué déprécié, avec un lien vers la nouvelle route', async () => {
    const org = await createOrg()
    signInAs(org.employee)
    const form = new FormData()
    form.set('receipt', pngFile())

    const response = await legacySuggest(request('/api/expense-notes/receipt-suggestion', { method: 'POST', body: form }))

    expect(response.status).toBe(200)
    expect(response.headers.get('Deprecation')).toBe('true')
    expect(response.headers.get('Link')).toBe('</api/receipt-suggestions>; rel="successor-version"')
  })

  it('refuse un fichier de plus de 5 Mo (413) au lieu de bloquer le serveur (SEC-08)', async () => {
    const org = await createOrg()
    signInAs(org.employee)
    const form = new FormData()
    form.set('receipt', new File([Buffer.alloc(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' }))

    const response = await legacySuggest(request('/api/expense-notes/receipt-suggestion', { method: 'POST', body: form }))

    expect(response.status).toBe(413)
  })
})
