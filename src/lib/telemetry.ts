import { metrics, trace, type Counter, type Histogram } from '@opentelemetry/api'

// Traceur et instruments de mesure de l'application (ADR 0011). Les
// instruments sont créés au premier usage, donc après le démarrage du SDK
// (`src/instrumentation.ts`) : un instrument créé avant serait un no-op.
// Sans SDK (tests), tout est no-op.

export const tracer = () => trace.getTracer('expense-io')

interface Instruments {
  routeDuration: Histogram
  notesSubmitted: Counter
  notesDecided: Counter
  decisionDelay: Histogram
  loginFailures: Counter
  forbidden: Counter
  managerAssignments: Counter
  signups: Counter
  emailVerifications: Counter
  storageDuration: Histogram
  outboxMessages: Counter
  outboxMessageDuration: Histogram
}

let instruments: Instruments | null = null

export function appMetrics(): Instruments {
  if (instruments) return instruments
  const meter = metrics.getMeter('expense-io')
  instruments = {
    routeDuration: meter.createHistogram('http.route.duration', {
      description: 'Durée des requêtes API, par route, méthode et code',
      unit: 's',
      advice: { explicitBucketBoundaries: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] },
    }),
    notesSubmitted: meter.createCounter('expense.notes.submitted', { description: 'Notes de frais soumises' }),
    notesDecided: meter.createCounter('expense.notes.decided', { description: 'Décisions, par type (approved, rejected)' }),
    decisionDelay: meter.createHistogram('expense.notes.decision_delay', {
      description: 'Délai entre la soumission et la décision',
      unit: 's',
      advice: { explicitBucketBoundaries: [60, 3600, 6 * 3600, 86400, 3 * 86400, 7 * 86400, 30 * 86400] },
    }),
    loginFailures: meter.createCounter('auth.login.failures', { description: 'Connexions refusées, par raison' }),
    forbidden: meter.createCounter('http.forbidden', { description: 'Réponses 403' }),
    managerAssignments: meter.createCounter('users.manager_assignments', { description: 'Rattachements de manager' }),
    signups: meter.createCounter('auth.signups', { description: 'Inscriptions, par résultat' }),
    emailVerifications: meter.createCounter('auth.email_verifications', {
      description: 'Liens de vérification d’email ouverts, par résultat',
    }),
    storageDuration: meter.createHistogram('storage.operation.duration', {
      description: 'Durée des appels au stockage objet (S3)',
      unit: 's',
    }),
    outboxMessages: meter.createCounter('outbox.messages', { description: 'Messages traités, par type et résultat' }),
    outboxMessageDuration: meter.createHistogram('outbox.message.duration', {
      description: 'Durée de traitement d’un message de l’outbox, par type',
      unit: 's',
    }),
  }
  return instruments
}

/** Mesure la durée de `fn` (en secondes) dans `histogram`, même en cas d'échec. */
export async function measure<T>(
  histogram: Histogram,
  attributes: Record<string, string>,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now()
  let outcome = 'success'
  try {
    return await fn()
  } catch (error) {
    outcome = 'error'
    throw error
  } finally {
    histogram.record((performance.now() - start) / 1000, { ...attributes, outcome })
  }
}
