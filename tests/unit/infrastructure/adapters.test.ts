import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConsoleEmailSender } from '@/infrastructure/notifications/ConsoleEmailSender'
import { s3BucketFromEnv, s3ClientConfigFromEnv } from '@/infrastructure/s3/s3-config'

afterEach(() => vi.restoreAllMocks())

describe('s3-config', () => {
  it('lit la configuration S3 depuis l’environnement', () => {
    expect(
      s3ClientConfigFromEnv({
        S3_ENDPOINT: 'http://localhost:4567',
        S3_REGION: 'eu-west-3',
        S3_FORCE_PATH_STYLE: 'false',
        S3_ACCESS_KEY_ID: 'id',
        S3_SECRET_ACCESS_KEY: 'secret',
      })
    ).toEqual({
      endpoint: 'http://localhost:4567',
      region: 'eu-west-3',
      forcePathStyle: false,
      credentials: { accessKeyId: 'id', secretAccessKey: 'secret' },
    })
    expect(s3BucketFromEnv({ S3_BUCKET: 'bucket' })).toBe('bucket')
  })

  it('a des valeurs par défaut compatibles avec LocalStack', () => {
    expect(s3ClientConfigFromEnv({})).toMatchObject({ region: 'us-east-1', forcePathStyle: true })
    expect(s3BucketFromEnv({})).toBe('receipts')
  })
})

describe('ConsoleEmailSender', () => {
  it('écrit l’email de vérification dans les logs (adaptateur de développement)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await new ConsoleEmailSender().sendEmailVerification({
      to: 'alice@acme.fr',
      name: 'Alice',
      verificationUrl: 'http://localhost:3000/verify-email?token=t',
    })
    expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({
      template: 'email-verification',
      to: 'alice@acme.fr',
      verificationUrl: 'http://localhost:3000/verify-email?token=t',
    })
  })
})
