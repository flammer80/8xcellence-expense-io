// Point d'entrée Next.js exécuté une fois au démarrage du serveur :
// 1. démarre OpenTelemetry (traces, métriques, logs vers le collecteur OTLP,
//    ADR 0011), sauf si `OTEL_SDK_DISABLED=true` ;
// 2. lance le worker de l'outbox dans le même process (ADR 0007). `make dev`
//    suffit donc à voir les notifications et les suggestions OCR arriver.
//    `OUTBOX_WORKER=off` le désactive sur une instance donnée ; plusieurs
//    instances peuvent aussi le faire tourner ensemble (`FOR UPDATE SKIP LOCKED`).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { startTelemetry } = await import('./infrastructure/observability/sdk')
  // Avant tout import de `pg` ou du SDK AWS : ils ne sont instrumentés que
  // s'ils sont chargés après le démarrage du SDK.
  await startTelemetry()
  if (process.env.OUTBOX_WORKER === 'off') return
  const { outboxWorker } = await import('./composition')
  outboxWorker.start()
}
