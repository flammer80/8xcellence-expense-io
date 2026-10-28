import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
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

export async function uploadReceipt(key: string, body: Buffer, contentType: string): Promise<void> {
  await getClient().send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType })
  )
}

export async function downloadReceipt(key: string): Promise<Buffer> {
  const response = await getClient().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  if (!response.Body) throw new Error(`Objet vide : ${key}`)
  return Buffer.from(await response.Body.transformToByteArray())
}

export async function deleteReceipt(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

export async function getReceiptUrl(key: string, expiresInSeconds = 300): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds })
}

/** Vérifie que le bucket des reçus répond (sonde `GET /api/health/ready`). */
export async function pingStorage(signal: AbortSignal): Promise<void> {
  await getClient().send(new HeadBucketCommand({ Bucket: BUCKET }), { abortSignal: signal })
}
