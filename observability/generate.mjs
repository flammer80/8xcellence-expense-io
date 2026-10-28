// Génère les tableaux de bord et les alertes Grafana d'Expense.io (ADR 0011).
//
//   node observability/generate.mjs
//
// Les fichiers produits (`grafana/dashboards/*.json`, `grafana/alerting/
// expense-io.yaml`) sont versionnés et provisionnés au démarrage du conteneur
// `observability`. On modifie ce script, pas le JSON : une requête PromQL se
// relit mieux ici que dans 600 lignes de JSON Grafana.
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const PROMETHEUS = { type: 'prometheus', uid: 'prometheus' }
const LOKI = { type: 'loki', uid: 'loki' }
const SERVICE = 'service_name="expense-io"'

// --- Panneaux -------------------------------------------------------------

let nextId = 1
const GRID_WIDTH = 24

/** Place les panneaux ligne par ligne, chacun avec sa largeur (`w`). */
function layout(rows) {
  const panels = []
  let y = 0
  for (const row of rows) {
    let x = 0
    const height = Math.max(...row.map((panel) => panel.h ?? 8))
    for (const { w, h, ...panel } of row) {
      panels.push({ ...panel, id: nextId++, gridPos: { x, y, w, h: h ?? 8 } })
      x += w
    }
    if (x > GRID_WIDTH) throw new Error(`Ligne trop large : ${row.map((p) => p.title).join(', ')}`)
    y += height
  }
  return panels
}

function timeseries(title, targets, { w = 12, unit = 'short', description, stack = false, h } = {}) {
  return {
    type: 'timeseries',
    title,
    description,
    w,
    h,
    datasource: PROMETHEUS,
    fieldConfig: {
      defaults: {
        unit,
        custom: { drawStyle: 'line', fillOpacity: stack ? 30 : 10, stacking: { mode: stack ? 'normal' : 'none' } },
      },
      overrides: [],
    },
    options: { legend: { displayMode: 'list', placement: 'bottom' }, tooltip: { mode: 'multi' } },
    targets: targets.map(([expr, legendFormat], index) => ({
      refId: String.fromCharCode(65 + index),
      datasource: PROMETHEUS,
      expr,
      legendFormat,
    })),
  }
}

function stat(title, expr, { w = 6, unit = 'short', description, thresholds = [], h = 4 } = {}) {
  return {
    type: 'stat',
    title,
    description,
    w,
    h,
    datasource: PROMETHEUS,
    fieldConfig: {
      defaults: {
        unit,
        thresholds: { mode: 'absolute', steps: [{ color: 'green', value: null }, ...thresholds] },
      },
      overrides: [],
    },
    options: { reduceOptions: { calcs: ['lastNotNull'] }, colorMode: 'value', graphMode: 'area' },
    targets: [{ refId: 'A', datasource: PROMETHEUS, expr }],
  }
}

function logs(title, expr, { w = 24, h = 10, description } = {}) {
  return {
    type: 'logs',
    title,
    description,
    w,
    h,
    datasource: LOKI,
    options: { showTime: true, wrapLogMessage: true, enableLogDetails: true, sortOrder: 'Descending' },
    targets: [{ refId: 'A', datasource: LOKI, expr }],
  }
}

function dashboard(uid, title, description, rows) {
  nextId = 1
  return {
    uid,
    title,
    description,
    tags: ['expense-io'],
    timezone: 'browser',
    schemaVersion: 39,
    refresh: '30s',
    time: { from: 'now-1h', to: 'now' },
    panels: layout(rows),
  }
}

const rate = (metric, filter = '') => `rate(${metric}{${[SERVICE, filter].filter(Boolean).join(', ')}}[$__rate_interval])`
const p95 = (metric, by) =>
  `histogram_quantile(0.95, sum by (le${by ? `, ${by}` : ''}) (${rate(`${metric}_bucket`)}))`

// --- 1. Vue d'ensemble de l'API -------------------------------------------

const apiOverview = dashboard(
  'expense-io-api',
  'Expense.io — API',
  'Trafic, erreurs et latence des routes, dépendances (Postgres, S3), événements de sécurité.',
  [
    [
      stat('Requêtes / s', `sum(${rate('http_route_duration_seconds_count')})`, { unit: 'reqps' }),
      stat('Taux de 5xx', `sum(${rate('http_route_duration_seconds_count', 'http_response_status_code=~"5.."')}) / sum(${rate('http_route_duration_seconds_count')})`, {
        unit: 'percentunit',
        thresholds: [{ color: 'red', value: 0.02 }],
        description: 'Alerte au-delà de 2 %.',
      }),
      stat('Latence p95', p95('http_route_duration_seconds'), {
        unit: 's',
        thresholds: [{ color: 'orange', value: 0.5 }, { color: 'red', value: 1 }],
        description: 'Alerte au-delà de 1 s.',
      }),
      stat('Refus 403 (1 h)', `sum(increase(http_forbidden_total{${SERVICE}}[1h]))`, {
        thresholds: [{ color: 'orange', value: 20 }],
      }),
    ],
    [
      timeseries('Requêtes par route', [[`sum by (http_route) (${rate('http_route_duration_seconds_count')})`, '{{http_route}}']], { unit: 'reqps' }),
      timeseries('Latence p95 par route', [[p95('http_route_duration_seconds', 'http_route'), '{{http_route}}']], { unit: 's' }),
    ],
    [
      timeseries(
        'Réponses en erreur par code',
        [[`sum by (http_response_status_code) (${rate('http_route_duration_seconds_count', 'http_response_status_code=~"[45].."')})`, '{{http_response_status_code}}']],
        { unit: 'reqps', stack: true }
      ),
      timeseries(
        'Sécurité : refus 403 et connexions refusées',
        [
          [`sum by (http_route) (increase(http_forbidden_total{${SERVICE}}[5m]))`, '403 {{http_route}}'],
          [`sum by (reason) (increase(auth_login_failures_total{${SERVICE}}[5m]))`, 'connexion : {{reason}}'],
        ],
        { description: 'Sur 5 minutes glissantes. `rate_limited` = limite de tentatives atteinte (ADR 0009).' }
      ),
    ],
    [
      timeseries('Connexions Postgres par pool', [[`sum by (pool, state) (db_client_connections{${SERVICE}})`, '{{pool}} {{state}}']], {
        description: 'Pool applicatif (20 max) et pool du worker (2 max). Des connexions `waiting` signalent un pool saturé.',
      }),
      timeseries(
        'Appels S3 : p95 par opération',
        [[p95('storage_operation_duration_seconds', 'operation'), '{{operation}}']],
        { unit: 's' }
      ),
    ],
    [
      logs(
        'Erreurs et événements de sécurité',
        `{${SERVICE}} | detected_level=~"error|warn"`,
        { description: 'Cliquer sur un log pour ouvrir sa trace (trace_id). Filtrer une requête : | correlation_id="…"' }
      ),
    ],
  ]
)

// --- 2. Workflow d'approbation ---------------------------------------------

const approvalWorkflow = dashboard(
  'expense-io-approval',
  'Expense.io — Workflow d’approbation',
  'Notes soumises et tranchées, délai de décision, notes en souffrance, inscriptions et rattachements.',
  [
    [
      stat('Notes soumises (24 h)', `sum(increase(expense_notes_submitted_total{${SERVICE}}[24h]))`),
      stat('Décisions (24 h)', `sum(increase(expense_notes_decided_total{${SERVICE}}[24h]))`),
      stat('En attente depuis plus de 7 jours', `sum(expense_notes_pending{${SERVICE}, age="gt_7d"})`, {
        thresholds: [{ color: 'orange', value: 1 }],
        description: 'Notes qu’aucun validateur n’a tranchées depuis une semaine.',
      }),
      stat('Délai médian de décision', `histogram_quantile(0.5, sum by (le) (rate(expense_notes_decision_delay_seconds_bucket{${SERVICE}}[1d])))`, {
        unit: 's',
      }),
    ],
    [
      timeseries('Soumissions et décisions', [
        [`sum(increase(expense_notes_submitted_total{${SERVICE}}[1h]))`, 'soumises'],
        [`sum by (decision) (increase(expense_notes_decided_total{${SERVICE}}[1h]))`, '{{decision}}'],
      ], { description: 'Par heure glissante.' }),
      timeseries('Notes en attente par ancienneté', [[`sum by (age) (expense_notes_pending{${SERVICE}})`, '{{age}}']], {
        stack: true,
        description: 'Toutes entreprises confondues (compteurs agrégés, aucune donnée de note).',
      }),
    ],
    [
      timeseries(
        'Délai entre soumission et décision',
        [
          [`histogram_quantile(0.5, sum by (le) (rate(expense_notes_decision_delay_seconds_bucket{${SERVICE}}[6h])))`, 'médiane'],
          [`histogram_quantile(0.95, sum by (le) (rate(expense_notes_decision_delay_seconds_bucket{${SERVICE}}[6h])))`, 'p95'],
        ],
        { unit: 's' }
      ),
      timeseries('Inscriptions, vérifications d’email, rattachements', [
        [`sum by (outcome) (increase(auth_signups_total{${SERVICE}}[1h]))`, 'inscription : {{outcome}}'],
        [`sum by (outcome) (increase(auth_email_verifications_total{${SERVICE}}[1h]))`, 'vérification : {{outcome}}'],
        [`sum by (action) (increase(users_manager_assignments_total{${SERVICE}}[1h]))`, 'rattachement : {{action}}'],
      ]),
    ],
  ]
)

// --- 3. Asynchrone et OCR --------------------------------------------------

const asyncOcr = dashboard(
  'expense-io-async',
  'Expense.io — Asynchrone et OCR',
  'File de l’outbox (ADR 0007) : profondeur, retard, lettres mortes, traitement par type de message dont l’OCR.',
  [
    [
      stat('Messages en attente', `max(outbox_pending{${SERVICE}})`, { w: 8 }),
      stat('Retard du plus vieux message', `max(outbox_oldest_pending_age_seconds{${SERVICE}})`, {
        w: 8,
        unit: 's',
        thresholds: [{ color: 'orange', value: 60 }, { color: 'red', value: 300 }],
        description: 'Alerte au-delà de 5 minutes : le worker est arrêté ou bloqué.',
      }),
      stat('Lettres mortes', `max(outbox_dead_letters{${SERVICE}})`, {
        w: 8,
        thresholds: [{ color: 'red', value: 1 }],
        description: 'Messages abandonnés après 5 tentatives : traitement manuel (DLQ).',
      }),
    ],
    [
      timeseries('Profondeur et retard de la file', [
        [`max(outbox_pending{${SERVICE}})`, 'en attente'],
        [`max(outbox_oldest_pending_age_seconds{${SERVICE}})`, 'retard (s)'],
      ]),
      timeseries('Messages traités par type et issue', [
        [`sum by (type, outcome) (increase(outbox_messages_total{${SERVICE}}[5m]))`, '{{type}} {{outcome}}'],
      ], { stack: true }),
    ],
    [
      timeseries('Durée de traitement p95 par type', [[p95('outbox_message_duration_seconds', 'type'), '{{type}}']], {
        unit: 's',
        description: '`ReceiptOcrRequested` = durée d’une analyse OCR (Tesseract).',
      }),
      timeseries(
        'Échecs OCR',
        [[`sum by (outcome) (increase(outbox_messages_total{${SERVICE}, type="ReceiptOcrRequested", outcome=~"retry-scheduled|dead-letter"}[15m]))`, '{{outcome}}']],
        { description: 'Une image qui n’est pas un reçu finit en lettre morte après ses tentatives.' }
      ),
    ],
    [logs('Logs du worker', `{${SERVICE}} | component="outbox-worker"`)],
  ]
)

for (const board of [apiOverview, approvalWorkflow, asyncOcr]) {
  writeFileSync(path.join(here, 'grafana/dashboards', `${board.uid}.json`), `${JSON.stringify(board, null, 2)}\n`)
}

// --- Alertes ----------------------------------------------------------------

/**
 * Une règle Grafana : la requête PromQL `expr` rend une valeur, comparée au
 * seuil (`> threshold`) ; l'alerte se déclenche si la condition tient `for`.
 */
const alerts = [
  {
    uid: 'expense-io-5xx-rate',
    title: 'Taux de 5xx supérieur à 2 %',
    expr: `sum(rate(http_route_duration_seconds_count{${SERVICE}, http_response_status_code=~"5.."}[5m])) / sum(rate(http_route_duration_seconds_count{${SERVICE}}[5m]))`,
    threshold: 0.02,
    for: '5m',
    severity: 'critical',
    summary: 'Plus de 2 % des requêtes API échouent en 500 depuis 5 minutes.',
    runbook: 'Tableau « Expense.io — API », panneau des erreurs ; ouvrir la trace d’un log `unexpected-error`.',
  },
  {
    uid: 'expense-io-p95-latency',
    title: 'Latence p95 supérieure à 1 s',
    expr: `histogram_quantile(0.95, sum by (le) (rate(http_route_duration_seconds_bucket{${SERVICE}}[5m])))`,
    threshold: 1,
    for: '10m',
    severity: 'warning',
    summary: 'Le 95e centile des requêtes API dépasse 1 seconde depuis 10 minutes.',
    runbook: 'Latence p95 par route, puis pool Postgres (`waiting`) et appels S3.',
  },
  {
    uid: 'expense-io-outbox-stuck',
    title: 'Outbox bloquée (plus vieux message de plus de 5 min)',
    expr: `max(outbox_oldest_pending_age_seconds{${SERVICE}})`,
    threshold: 300,
    for: '2m',
    severity: 'critical',
    summary: 'Un message attend depuis plus de 5 minutes : notifications et OCR ne sont plus traités.',
    runbook: 'Vérifier que le worker tourne (OUTBOX_WORKER, logs `outbox-worker`) et la connexion du rôle expense_worker.',
  },
  {
    uid: 'expense-io-dead-letter',
    title: 'Nouvelle lettre morte dans l’outbox',
    expr: `max(outbox_dead_letters{${SERVICE}}) - max(outbox_dead_letters{${SERVICE}} offset 10m)`,
    threshold: 0,
    for: '0s',
    severity: 'warning',
    summary: 'Un message a épuisé ses tentatives et attend un traitement manuel.',
    runbook: 'SELECT type, last_error FROM outbox WHERE dead_at IS NOT NULL ORDER BY dead_at DESC (rôle propriétaire).',
  },
  {
    uid: 'expense-io-forbidden-spike',
    title: 'Pic de refus 403',
    expr: `sum(increase(http_forbidden_total{${SERVICE}}[5m]))`,
    threshold: 20,
    for: '0s',
    severity: 'warning',
    summary: 'Plus de 20 refus 403 en 5 minutes : sondage d’identifiants (IDOR) ou régression d’autorisation.',
    runbook: 'Loki : {service_name="expense-io"} | event="forbidden", regrouper par route.',
  },
  {
    uid: 'expense-io-login-failures-spike',
    title: 'Pic de connexions refusées',
    expr: `sum(increase(auth_login_failures_total{${SERVICE}}[5m]))`,
    threshold: 20,
    for: '0s',
    severity: 'warning',
    summary: 'Plus de 20 connexions refusées en 5 minutes : force brute ou credential stuffing.',
    runbook: 'Loki : {service_name="expense-io"} | event="login-refused", regrouper par emailHash.',
  },
  {
    uid: 'expense-io-rate-limited',
    title: 'Limite de tentatives atteinte',
    expr: `sum(increase(auth_login_failures_total{${SERVICE}, reason="rate_limited"}[15m])) + sum(increase(auth_signups_total{${SERVICE}, outcome="rate_limited"}[15m]) or vector(0))`,
    threshold: 5,
    for: '0s',
    severity: 'info',
    summary: 'La limitation des tentatives (ADR 0009) a bloqué plus de 5 essais en 15 minutes.',
    runbook: 'Loki : {service_name="expense-io"} | security="true" | reason="rate_limited".',
  },
]

function alertRule({ uid, title, expr, threshold, for: pending, severity, summary, runbook }) {
  return `      - uid: ${uid}
        title: ${JSON.stringify(title)}
        condition: C
        for: ${pending}
        noDataState: OK
        execErrState: Error
        labels:
          severity: ${severity}
          service: expense-io
        annotations:
          summary: ${JSON.stringify(summary)}
          runbook: ${JSON.stringify(runbook)}
        data:
          - refId: A
            datasourceUid: prometheus
            relativeTimeRange: { from: 900, to: 0 }
            model:
              refId: A
              instant: true
              expr: ${JSON.stringify(expr)}
          - refId: B
            datasourceUid: __expr__
            model: { refId: B, type: reduce, expression: A, reducer: last }
          - refId: C
            datasourceUid: __expr__
            model:
              refId: C
              type: threshold
              expression: B
              conditions:
                - evaluator: { type: gt, params: [${threshold}] }
`
}

writeFileSync(
  path.join(here, 'grafana/alerting/expense-io.yaml'),
  `# Généré par observability/generate.mjs — ne pas modifier à la main (ADR 0011).
# Règles d'alerte d'Expense.io, évaluées par Grafana sur les métriques
# Prometheus. Sans trafic, une règle reste « OK » (noDataState).
apiVersion: 1
groups:
  - orgId: 1
    name: expense-io
    folder: Expense.io
    interval: 1m
    rules:
${alerts.map(alertRule).join('')}`
)

console.log('Tableaux de bord et alertes générés dans observability/grafana/.')
