import { beforeEach, describe, expect, it, vi } from 'vitest'

// SEC-08 : un worker Tesseract partagé, une analyse à la fois, taille bornée.
// Tesseract est simulé pour observer créations et concurrence.

let running = 0
let maxRunning = 0
const recognize = vi.fn(async () => {
  running++
  maxRunning = Math.max(maxRunning, running)
  await new Promise((resolve) => setTimeout(resolve, 5))
  running--
  return { data: { text: 'TOTAL TTC 12,50 €\n20/10/2026' } }
})
const createWorker = vi.fn(async () => ({ recognize, terminate: vi.fn(async () => {}) }))
vi.mock('tesseract.js', () => ({ createWorker }))

const png = (size = 16) => ({ data: Buffer.alloc(size), mimeType: 'image/png' })

describe('lib/ocr — recognizeReceipt', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    maxRunning = 0
  })

  it('réutilise un seul worker et n’analyse qu’un reçu à la fois', async () => {
    const { recognizeReceipt } = await import('@/lib/ocr')

    const results = await Promise.all([recognizeReceipt(png()), recognizeReceipt(png()), recognizeReceipt(png())])

    expect(createWorker).toHaveBeenCalledTimes(1)
    expect(recognize).toHaveBeenCalledTimes(3)
    expect(maxRunning).toBe(1)
    expect(results[0]).toEqual({ amount: 12.5, expenseDate: '2026-10-20' })
  })

  it('n’analyse pas une image de plus de 5 Mo ni un type non supporté', async () => {
    const { MAX_OCR_BYTES, recognizeReceipt } = await import('@/lib/ocr')

    expect(await recognizeReceipt(png(MAX_OCR_BYTES + 1))).toEqual({})
    expect(await recognizeReceipt({ data: Buffer.alloc(16), mimeType: 'application/pdf' })).toEqual({})
    expect(recognize).not.toHaveBeenCalled()
  })

  it('propage une panne, puis recrée un worker neuf à l’analyse suivante', async () => {
    const { recognizeReceipt } = await import('@/lib/ocr')
    recognize.mockRejectedValueOnce(new Error('crash'))

    await expect(recognizeReceipt(png())).rejects.toThrow('crash')
    await recognizeReceipt(png())

    expect(createWorker).toHaveBeenCalledTimes(2)
  })
})
