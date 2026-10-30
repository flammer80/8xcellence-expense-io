import { Writable } from 'node:stream'
import { trace } from '@opentelemetry/api'
import { afterAll, describe, expect, it } from 'vitest'
import { runWithCorrelationId } from '@/lib/correlation'
import { createLogger, emailFingerprint } from '@/lib/logger'
import { installTestTracing } from '../../helpers/otel'

// ADR 0011 : chaque log relie sa requête (correlation_id) et sa trace
// (trace_id, span_id) ; secrets et données personnelles n'y apparaissent jamais.

const tracing = installTestTracing()
afterAll(() => tracing.uninstall())

function capture(): { logger: ReturnType<typeof createLogger>; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = []
  const destination = new Writable({
    write(chunk: Buffer, _encoding, done) {
      chunks.push(chunk.toString())
      done()
    },
  })
  return { logger: createLogger(destination, 'info'), lines: () => chunks.map((line) => JSON.parse(line)) }
}

describe('logger structuré', () => {
  it('un log d’erreur porte le trace_id, le span_id et le correlation_id de la requête', () => {
    const { logger, lines } = capture()

    const spanContext = trace.getTracer('test').startActiveSpan('requête', (span) => {
      runWithCorrelationId('corr-1234-abcd', () => logger.error({ err: new Error('boom') }, 'unexpected-error'))
      span.end()
      return span.spanContext()
    })

    expect(lines()[0]).toMatchObject({
      level: 'error',
      msg: 'unexpected-error',
      correlation_id: 'corr-1234-abcd',
      trace_id: spanContext.traceId,
      span_id: spanContext.spanId,
      err: { message: 'boom' },
    })
  })

  it('hors requête et hors trace, aucun identifiant n’est inventé', () => {
    const { logger, lines } = capture()
    logger.info('démarrage')
    expect(lines()[0]).not.toHaveProperty('trace_id')
    expect(lines()[0]).not.toHaveProperty('correlation_id')
  })

  it('masque secrets et emails, à la racine comme un niveau plus bas', () => {
    const { logger, lines } = capture()

    logger.warn(
      {
        security: true,
        email: 'alice@acme.fr',
        password: 'hunter22',
        token: 'jeton-secret',
        user: { email: 'bob@acme.fr', passwordHash: '$2a$12$abc' },
        payload: { verificationUrl: 'http://localhost:3000/verify-email?token=jeton-secret' },
      },
      'login-refused'
    )

    const raw = JSON.stringify(lines()[0])
    for (const secret of ['alice@acme.fr', 'bob@acme.fr', 'hunter22', 'jeton-secret', '$2a$12$abc']) {
      expect(raw).not.toContain(secret)
    }
    expect(lines()[0]).toMatchObject({ email: '[masqué]', user: { email: '[masqué]' } })
  })

  it('l’empreinte d’un email relie les événements d’un compte sans révéler l’adresse', () => {
    expect(emailFingerprint(' Alice@Acme.fr ')).toBe(emailFingerprint('alice@acme.fr'))
    expect(emailFingerprint('alice@acme.fr')).toMatch(/^[0-9a-f]{12}$/)
    expect(emailFingerprint('alice@acme.fr')).not.toContain('alice')
  })
})
