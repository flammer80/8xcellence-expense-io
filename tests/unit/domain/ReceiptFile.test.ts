import { describe, expect, it } from 'vitest'
import { InvalidInputError } from '@/domain/errors'
import { MAX_RECEIPT_BYTES, ReceiptFile } from '@/domain/ReceiptFile'
import { receiptKeyFor } from '@/domain/ReceiptKey'

const bytes = (...values: number[]) => Uint8Array.from(values)

const SAMPLES = {
  'image/png': bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00),
  'image/jpeg': bytes(0xff, 0xd8, 0xff, 0xe0, 0x00),
  'image/webp': Uint8Array.from(Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1')),
  'application/pdf': Uint8Array.from(Buffer.from('%PDF-1.7\n')),
} as const

function fieldOf(fn: () => unknown): string | null {
  try {
    fn()
    return null
  } catch (error) {
    return error instanceof InvalidInputError ? error.field : 'autre erreur'
  }
}

describe('ReceiptFile', () => {
  it.each(Object.entries(SAMPLES))('accepte un vrai %s et donne son extension', (type, content) => {
    const file = ReceiptFile.from(content, type)
    expect(file.contentType).toBe(type)
    expect(file.extension).toMatch(/^\.(png|jpg|webp|pdf)$/)
  })

  it.each([
    ['un PDF annoncé PNG', SAMPLES['application/pdf'], 'image/png'],
    ['un PNG annoncé PDF', SAMPLES['image/png'], 'application/pdf'],
    ['un conteneur RIFF qui n’est pas du WebP', Uint8Array.from(Buffer.from('RIFF\x24\x00\x00\x00WAVE', 'latin1')), 'image/webp'],
    ['un fichier vide', bytes(), 'image/jpeg'],
  ])('refuse %s (type)', (_label, content, type) => {
    expect(fieldOf(() => ReceiptFile.from(content, type))).toBe('receipt.type')
  })

  it.each(['image/gif', 'text/html', ''])('refuse le type annoncé « %s »', (type) => {
    expect(fieldOf(() => ReceiptFile.from(SAMPLES['image/png'], type))).toBe('receipt.type')
  })

  it('refuse un fichier de plus de 10 Mo (taille)', () => {
    const big = new Uint8Array(MAX_RECEIPT_BYTES + 1)
    big.set(SAMPLES['image/png'])
    expect(fieldOf(() => ReceiptFile.from(big, 'image/png'))).toBe('receipt.size')
  })
})

describe('receiptKeyFor', () => {
  it("préfixe par l'entreprise et nomme par l'UUID de la note", () => {
    expect(receiptKeyFor('acme', 'note-uuid', '.pdf')).toBe('receipts/acme/note-uuid.pdf')
  })
})
