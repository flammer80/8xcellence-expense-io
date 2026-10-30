import { context, propagation, trace } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace'

/**
 * Installe un traceur OpenTelemetry réel, en mémoire, pour le fichier de test
 * (contexte asynchrone et propagation W3C compris), comme le ferait le SDK
 * démarré par `src/instrumentation.ts`. Les spans terminés se lisent dans
 * `exporter.getFinishedSpans()`.
 */
export function installTestTracing(): { exporter: InMemorySpanExporter; uninstall: () => void } {
  const exporter = new InMemorySpanExporter()
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  propagation.setGlobalPropagator(new W3CTraceContextPropagator())
  trace.setGlobalTracerProvider(new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] }))
  return {
    exporter,
    uninstall: () => {
      trace.disable()
      context.disable()
      propagation.disable()
    },
  }
}
