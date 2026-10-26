// Point d'entrée Next.js exécuté une fois au démarrage du serveur : on y
// lance le worker de l'outbox dans le même process (ADR 0007). `make dev`
// suffit donc à voir les notifications et les suggestions OCR arriver.
// `OUTBOX_WORKER=off` le désactive sur une instance donnée ; plusieurs
// instances peuvent aussi le faire tourner ensemble (`FOR UPDATE SKIP LOCKED`).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.OUTBOX_WORKER === 'off') return
  const { outboxWorker } = await import('./composition')
  outboxWorker.start()
}
