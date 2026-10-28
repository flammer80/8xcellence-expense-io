import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { AwsInstrumentation } from '@opentelemetry/instrumentation-aws-sdk'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace'
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { logger } from '@/lib/logger'

let sdk: NodeSDK | null = null

/**
 * Démarre le SDK OpenTelemetry (ADR 0011) : traces, métriques et logs
 * exportés en OTLP/HTTP vers `OTEL_EXPORTER_OTLP_ENDPOINT` (le conteneur
 * `observability` en local). Instrumentation automatique de `http`, `pg`
 * et du SDK AWS (S3) ; les spans des cas d'usage et de l'outbox sont posés
 * par l'application elle-même.
 *
 * `OTEL_SDK_DISABLED=true` (tests, CI) : rien ne démarre, toute la
 * télémétrie reste un no-op et l'application fonctionne à l'identique.
 * Une stack d'observabilité absente ne bloque jamais l'application : les
 * exports en échec sont abandonnés.
 */
export async function startTelemetry(): Promise<void> {
  if (sdk || process.env.OTEL_SDK_DISABLED === 'true') return
  const endpoint = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318').replace(/\/$/, '')

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'expense-io',
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? 'dev',
      'deployment.environment.name': process.env.NODE_ENV ?? 'development',
    }),
    spanProcessors: [new BatchSpanProcessor({ exporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }) })],
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
        exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL ?? 15_000),
      }),
    ],
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: `${endpoint}/v1/logs` }) })],
    instrumentations: [
      new HttpInstrumentation({
        // Les sondes de santé et les assets n'ont rien à faire dans les traces.
        ignoreIncomingRequestHook: (request) => /^\/(api\/health|_next)\b/.test(request.url ?? ''),
      }),
      new PgInstrumentation({ enhancedDatabaseReporting: false }),
      new AwsInstrumentation(),
    ],
  })
  sdk.start()
  // Import différé : `backgroundMetrics` charge `pg`, qui doit l'être **après**
  // le démarrage du SDK pour être instrumenté (même règle pour `composition`
  // dans `src/instrumentation.ts`).
  const { registerBackgroundMetrics } = await import('./backgroundMetrics')
  registerBackgroundMetrics()
  logger.info({ event: 'telemetry-started', endpoint }, 'telemetry-started')

  process.once('SIGTERM', () => {
    void sdk?.shutdown()
  })
}
