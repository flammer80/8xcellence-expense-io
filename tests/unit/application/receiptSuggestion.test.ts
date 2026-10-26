import { describe, expect, it, vi } from 'vitest'
import { GetReceiptSuggestion } from '@/application/GetReceiptSuggestion'
import { ProcessReceiptOcr } from '@/application/handlers/ProcessReceiptOcr'
import { OutboxWorker } from '@/application/OutboxWorker'
import type { OcrService } from '@/application/ports/OcrService'
import { MAX_OCR_RECEIPT_BYTES, RequestReceiptSuggestion } from '@/application/RequestReceiptSuggestion'
import { InvalidInputError, NotFoundError } from '@/domain/errors'
import { InMemoryOutboxStore } from '@/infrastructure/in-memory/InMemoryOutboxStore'
import { InMemoryReceiptStorage } from '@/infrastructure/in-memory/InMemoryReceiptStorage'
import { InMemoryReceiptSuggestionRepository } from '@/infrastructure/in-memory/InMemoryReceiptSuggestionRepository'
import { InMemoryUserRepository } from '@/infrastructure/in-memory/InMemoryUserRepository'
import { aUser } from '../../helpers/builders'

const NOW = new Date('2026-10-26T09:00:00.000Z')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])

function setup(suggest: OcrService['suggest'] = async () => ({ amount: 12.5, expenseDate: '2026-10-20' })) {
  const users = new InMemoryUserRepository([aUser('employee'), aUser('colleague')])
  const suggestions = new InMemoryReceiptSuggestionRepository()
  const files = new InMemoryReceiptStorage()
  const ocr = { suggest: vi.fn(suggest) }
  let ids = 0
  const request = new RequestReceiptSuggestion(suggestions, users, files, () => NOW, () => `id-${++ids}`)
  const get = new GetReceiptSuggestion(suggestions)
  const outbox = new InMemoryOutboxStore(() => NOW)
  const worker = new OutboxWorker(
    outbox,
    { ReceiptOcrRequested: new ProcessReceiptOcr(suggestions, files, ocr, () => NOW) },
    { maxAttempts: 2, batchSize: 10, leaseSeconds: 60, retryDelayMs: () => 0 },
    () => {},
    () => NOW
  )
  const relay = () => outbox.publish(...suggestions.jobs.splice(0))
  return { request, get, files, ocr, worker, outbox, suggestions, relay }
}

const receipt = (bytes = PNG, declaredType = 'image/png') => ({ actorId: 'employee', receipt: { bytes, declaredType } })

describe('Suggestion OCR asynchrone', () => {
  it('la demande répond tout de suite : en attente, fichier déposé, job publié, OCR pas encore lancé', async () => {
    const { request, files, ocr } = setup()

    const suggestion = await request.execute(receipt())

    expect(suggestion).toMatchObject({ id: 'id-1', status: 'pending', fileKey: 'ocr/acme/id-1.png' })
    expect(files.files.has('ocr/acme/id-1.png')).toBe(true)
    expect(ocr.suggest).not.toHaveBeenCalled()
  })

  it('le worker analyse le reçu, enregistre les champs et supprime le fichier temporaire', async () => {
    const { request, get, files, worker, relay } = setup()
    await request.execute(receipt())
    relay()

    await worker.drain()

    expect(await get.execute({ suggestionId: 'id-1', actorId: 'employee' })).toMatchObject({
      status: 'done',
      fields: { amount: 12.5, expenseDate: '2026-10-20' },
      completedAt: NOW,
    })
    expect(files.files.has('ocr/acme/id-1.png')).toBe(false)
  })

  it('après des pannes répétées, la demande passe à `failed` : le client arrête d’attendre', async () => {
    const { request, get, worker, relay } = setup(async () => {
      throw new Error('Tesseract a planté')
    })
    await request.execute(receipt())
    relay()

    await worker.drain()

    expect((await get.execute({ suggestionId: 'id-1', actorId: 'employee' })).status).toBe('failed')
  })

  it('un job rejoué après traitement ne relance pas l’OCR (idempotent)', async () => {
    const { request, ocr, worker, outbox, suggestions } = setup()
    await request.execute(receipt())
    const [job] = suggestions.jobs

    outbox.publish(job)
    await worker.drain()
    // Même job livré une seconde fois (worker planté avant l'ack).
    outbox.publish(job)
    await worker.drain()

    expect(ocr.suggest).toHaveBeenCalledTimes(1)
  })

  it('refuse un fichier trop gros, ou dont le contenu ne correspond pas au type annoncé', async () => {
    const { request } = setup()
    const tooBig = Buffer.concat([PNG, Buffer.alloc(MAX_OCR_RECEIPT_BYTES)])

    await expect(request.execute(receipt(tooBig))).rejects.toThrow(InvalidInputError)
    await expect(request.execute(receipt(Buffer.from('%PDF-1.7'), 'image/png'))).rejects.toThrow(InvalidInputError)
  })

  it('une demande n’est visible que de son auteur', async () => {
    const { request, get } = setup()
    await request.execute(receipt())

    await expect(get.execute({ suggestionId: 'id-1', actorId: 'colleague' })).rejects.toThrow(NotFoundError)
  })
})
