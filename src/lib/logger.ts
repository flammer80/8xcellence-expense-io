import { createHash } from 'node:crypto'
import { Writable } from 'node:stream'
import { logs, trace, type Attributes } from '@opentelemetry/api'
import pino, { type DestinationStream, type Logger } from 'pino'
import { currentCorrelationId } from './correlation'

// Logger unique de l'application (ADR 0011). Chaque ligne est un objet JSON
// écrit sur la sortie standard **et** transmis au SDK OpenTelemetry (puis à
// Loki), avec :
// - `trace_id` / `span_id` du span actif : on passe d'un log à sa trace ;
// - `correlation_id` de la requête HTTP d'origine (X-Correlation-Id).
// Sans SDK démarré (tests, OTEL_SDK_DISABLED), l'envoi OTel est un no-op.

/**
 * Champs jamais écrits en clair, où qu'ils apparaissent (un niveau de
 * profondeur) : secrets, jetons, et données personnelles directes.
 */
const REDACTED_PATHS = ['password', 'passwordHash', 'token', 'verificationUrl', 'email', 'authorization', 'cookie']
  .flatMap((field) => [field, `*.${field}`])

const SEVERITY_NUMBER: Record<string, number> = { trace: 1, debug: 5, info: 9, warn: 13, error: 17, fatal: 21 }

/** Relaie chaque ligne JSON au LoggerProvider OpenTelemetry, dans le contexte (trace) courant. */
function openTelemetryStream(): DestinationStream {
  const otelLogger = logs.getLogger('expense-io')
  return new Writable({
    write(chunk: Buffer, _encoding, done) {
      try {
        const { level, msg, ...rest } = JSON.parse(chunk.toString()) as Record<string, unknown>
        // L'horodatage est porté par l'enregistrement OTel lui-même.
        delete rest.time
        otelLogger.emit({
          severityText: String(level).toUpperCase(),
          severityNumber: SEVERITY_NUMBER[String(level)],
          body: typeof msg === 'string' ? msg : undefined,
          attributes: flatten(rest),
        })
      } catch {
        // Une ligne illisible ne doit jamais faire échouer l'appelant.
      }
      done()
    },
  })
}

function flatten(record: Record<string, unknown>, prefix = ''): Attributes {
  const out: Attributes = {}
  for (const [key, value] of Object.entries(record)) {
    const name = prefix ? `${prefix}.${key}` : key
    if (value === null || value === undefined) continue
    if (typeof value === 'object' && !Array.isArray(value)) Object.assign(out, flatten(value as Record<string, unknown>, name))
    else out[name] = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : JSON.stringify(value)
  }
  return out
}

/** Identifiants de trace et de corrélation du contexte courant, ajoutés à chaque ligne. */
export function contextFields(): Record<string, string> {
  const fields: Record<string, string> = {}
  const correlationId = currentCorrelationId()
  if (correlationId) fields.correlation_id = correlationId
  const span = trace.getActiveSpan()?.spanContext()
  if (span && trace.isSpanContextValid(span)) {
    fields.trace_id = span.traceId
    fields.span_id = span.spanId
  }
  return fields
}

/** Crée un logger ; `destination` et `level` remplacent la sortie standard et `LOG_LEVEL` (tests). */
export function createLogger(
  destination: DestinationStream = process.stdout,
  level: string = process.env.LOG_LEVEL ?? 'info'
): Logger {
  return pino(
    {
      level,
      base: { service: process.env.OTEL_SERVICE_NAME ?? 'expense-io' },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      redact: { paths: REDACTED_PATHS, censor: '[masqué]' },
      mixin: contextFields,
    },
    pino.multistream([{ stream: destination }, { stream: openTelemetryStream() }])
  )
}

export const logger = createLogger()

/**
 * Empreinte courte d'un email, pour relier des événements de sécurité au même
 * compte sans écrire l'adresse dans les logs.
 */
export function emailFingerprint(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 12)
}

/**
 * Erreur inattendue (500) : le détail complet (message, stack, SQL) reste
 * dans les logs, relié à la réponse par l'id de corrélation (SEC-07).
 */
export function logUnexpectedError(error: unknown, correlationId: string): void {
  logger.error({ err: error, correlation_id: correlationId, event: 'unexpected-error' }, 'unexpected-error')
}

/**
 * Événement de sécurité, avec le champ `security: true` pour les filtrer dans
 * Loki et les alertes. Un refus (connexion, inscription, 403) est en `warn`,
 * une action sensible réussie (rattachement de manager) en `info`.
 */
export function logSecurityEvent(event: string, fields: Record<string, unknown> = {}, level: 'info' | 'warn' = 'warn'): void {
  logger[level]({ security: true, event, ...fields }, event)
}
