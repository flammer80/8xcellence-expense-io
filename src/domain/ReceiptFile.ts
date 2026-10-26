import { InvalidInputError } from './errors'

/** Types de reçu acceptés, avec l'extension du fichier stocké. */
export const RECEIPT_EXTENSION_BY_TYPE = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
} as const

export type ReceiptContentType = keyof typeof RECEIPT_EXTENSION_BY_TYPE

/** Taille maximale d'un reçu : 10 Mo. */
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024

/** Signature binaire (« magic bytes ») de chaque type accepté. */
const SIGNATURE_MATCHERS: Record<ReceiptContentType, (bytes: Uint8Array) => boolean> = {
  'image/png': (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  // RIFF....WEBP : la taille du conteneur occupe les octets 4 à 7.
  'image/webp': (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b.subarray(8), [0x57, 0x45, 0x42, 0x50]),
  'application/pdf': (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]), // %PDF-
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.length <= bytes.length && signature.every((byte, i) => bytes[i] === byte)
}

function isReceiptContentType(type: string): type is ReceiptContentType {
  return Object.hasOwn(RECEIPT_EXTENSION_BY_TYPE, type)
}

/**
 * Justificatif d'une note de frais : une image ou un PDF de 10 Mo au plus,
 * dont le **contenu** correspond au type annoncé (S9). Le type MIME vient du
 * client et ne prouve rien : on vérifie les premiers octets du fichier.
 */
export class ReceiptFile {
  private constructor(
    readonly bytes: Uint8Array,
    readonly contentType: ReceiptContentType
  ) {}

  /**
   * @throws InvalidInputError (`receipt.type`) si le type annoncé n'est pas
   *   accepté ou si le contenu ne lui correspond pas ;
   * @throws InvalidInputError (`receipt.size`) si le fichier dépasse
   *   `MAX_RECEIPT_BYTES`.
   */
  static from(bytes: Uint8Array, declaredType: string): ReceiptFile {
    if (!isReceiptContentType(declaredType)) {
      throw new InvalidInputError('receipt.type', `type ${declaredType || 'inconnu'} non accepté`)
    }
    if (bytes.length > MAX_RECEIPT_BYTES) {
      throw new InvalidInputError('receipt.size', `au plus ${MAX_RECEIPT_BYTES} octets`)
    }
    if (!SIGNATURE_MATCHERS[declaredType](bytes)) {
      throw new InvalidInputError('receipt.type', `le contenu ne correspond pas au type ${declaredType}`)
    }
    return new ReceiptFile(bytes, declaredType)
  }

  get extension(): string {
    return RECEIPT_EXTENSION_BY_TYPE[this.contentType]
  }
}
