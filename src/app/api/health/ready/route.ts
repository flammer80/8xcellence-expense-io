import { readinessResponse } from '@/interface/http/health'
import { getPool } from '@/lib/db'
import { pingStorage } from '@/lib/storage'

// Sonde de disponibilité (ADR 0011) : Postgres et S3 répondent, sinon 503.
export const dynamic = 'force-dynamic'

export function GET(): Promise<Response> {
  return readinessResponse({
    postgres: () => getPool().query('SELECT 1'),
    storage: (signal) => pingStorage(signal),
  })
}
