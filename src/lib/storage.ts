import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3BucketFromEnv, s3ClientConfigFromEnv } from '@/infrastructure/s3/s3-config'

let client: S3Client | undefined

function getClient(): S3Client {
  if (!client) {
    client = new S3Client(s3ClientConfigFromEnv())
  }
  return client
}

const BUCKET = s3BucketFromEnv()

// Nom de fichier lisible, dérivé du compteur de reçu de la note plutôt que
// d'un identifiant opaque.
export function receiptKeyFor(receiptSeq: number, extension: string): string {
  return `receipts/${receiptSeq}${extension}`
}

export async function uploadReceipt(key: string, body: Buffer, contentType: string): Promise<void> {
  await getClient().send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType })
  )
}

export async function getReceiptUrl(key: string, expiresInSeconds = 300): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds })
}
