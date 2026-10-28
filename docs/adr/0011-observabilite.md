# ADR 0011 — Observabilité : traces, logs et métriques avec OpenTelemetry

- **Statut :** accepté
- **Date :** 2026-10-28
- **Contexte de l'audit :** OPS-02 (logs `console` sans corrélation), SEC-07 (fuite des erreurs internes, corrigée à l'étape 1 mais journalisée en texte libre). Recommandation R9 de `docs/audit/audit-v2.md`. Prolonge l'ADR 0007 (traçabilité de l'asynchrone).

## Contexte

Après l'étape 6, l'application se diagnostiquait mal en production :

- **6 appels `console.*` dans 5 fichiers**, en texte libre ou en JSON fait main. Une erreur 500 donnait au client un `correlationId`, mais la ligne de log correspondante n'était pas structurée.
- **Une corrélation incomplète.** `X-Correlation-Id` n'était posé que par les 9 routes qui modifient l'état ; les 12 routes de lecture, les pages et les server actions (connexion, inscription) n'en avaient pas.
- **Aucune trace.** Une décision lente pouvait venir de la RLS, du pool Postgres, de S3 ou du worker : rien ne permettait de le savoir. En asynchrone, le cours le rappelle (annexe B.6) : *on ne sait pas quel worker a géré le message*.
- **Aucune métrique.** Ni le taux d'erreur, ni la latence, ni le retard de la file de l'outbox, ni une note bloquée depuis deux semaines n'étaient visibles avant qu'un client ne s'en plaigne.
- **Aucune sonde de santé** : un répartiteur de charge ne pouvait pas savoir qu'une instance avait perdu Postgres.
- **Aucune trace des événements de sécurité.** Une force brute sur la connexion, une série de 403 (sondage d'identifiants, cf. SEC-04) ou un rattachement de manager ne laissaient rien.

## Décision

**1. OpenTelemetry comme seul standard d'instrumentation, exporté en OTLP.**
- Le SDK démarre dans `src/instrumentation.ts`, **avant** que `pg` et le SDK AWS ne soient chargés, sinon ils ne seraient pas instrumentés.
- L'instrumentation automatique couvre `http`, `pg` (une span par requête SQL, sans les valeurs) et S3. Next.js ajoute ses propres spans (route, rendu).
- Traces, métriques et logs partent en OTLP/HTTP vers `OTEL_EXPORTER_OTLP_ENDPOINT`. Le code ne connaît aucun fournisseur : changer de backend (Grafana Cloud, Datadog, Honeycomb) ne touche que cette variable.
- `OTEL_SDK_DISABLED=true` coupe tout (tests, CI) : la télémétrie devient un no-op et l'application se comporte à l'identique. Une stack absente ne bloque jamais l'application.

**2. Une stack locale en un conteneur : `grafana/otel-lgtm` (épinglée en 0.37.0).** Elle regroupe le collecteur OpenTelemetry, Tempo (traces), Loki (logs), Prometheus (métriques) et Grafana (http://localhost:3001). `make up` la démarre sans l'attendre.

**3. Une trace de bout en bout, de la requête HTTP au worker.**
- Chaque cas d'usage devient une span `usecase <Nom>`. Un décorateur posé dans la racine de composition s'en charge (`instrumentUseCase`) : **la couche application n'importe pas OpenTelemetry**, et l'ESLint l'interdit (`@opentelemetry/*` et `pino` ajoutés au garde-fou de l'ADR 0002).
- Attributs : identifiants de la note, de l'acteur, de l'entreprise, la décision et l'issue. **Liste fermée, sans donnée personnelle** : ni email, ni nom, ni montant, ni description.
- Une erreur du domaine (403, 404, 409, 422) est un résultat métier : elle est notée (`expense.outcome`) sans marquer la span en erreur. Seule une panne le fait.
- La migration `1700000000007` ajoute `outbox.traceparent`. Le contexte W3C de la requête y est écrit **dans la même transaction que le message**.
- Le worker reprend ce contexte. Un nouveau port, `MessageObserver`, garde le worker ignorant de l'outil ; son implémentation est `OpenTelemetryMessageObserver`. Une décision et la notification qu'elle déclenche forment **une seule trace** : 36 spans vérifiées sur la stack locale, dont celles de la RLS et de l'outbox.

**4. Des logs JSON structurés avec pino (`src/lib/logger.ts`).**
- Chaque ligne porte `trace_id`, `span_id` et `correlation_id`. Elle est écrite sur la sortie standard **et** transmise à Loki par OTLP. Dans Grafana, on passe d'un log à sa trace en un clic.
- `X-Correlation-Id` est généralisé : `proxy.ts` le pose sur **toutes** les requêtes (pages, API, server actions), et `traced()` enveloppe désormais les 21 routes de l'API. On garde cet en-tête existant, déjà documenté dans OpenAPI, plutôt que d'ajouter un `X-Request-Id` redondant. Le `trace_id` W3C le complète, il ne le remplace pas.
- **Masquage systématique** (`redact`) : `password`, `passwordHash`, `token`, `verificationUrl`, `email`, `authorization` et `cookie`, à la racine comme un niveau plus bas.
- Le lien de vérification d'email (`ConsoleEmailSender`, adaptateur de développement) est écrit sur la sortie standard **à côté du logger**. Il n'atteint donc jamais Loki ; le logger ne reçoit qu'un événement `email-sent`, sans adresse ni jeton.
- **Plus aucun `console.*` dans `src/`.** La règle ESLint `no-console` le garantit.

**5. Des événements de sécurité filtrables** (`security: true`) :

| Événement | Où | Champs |
| --- | --- | --- |
| `login-refused` | `lib/auth.ts` | raison (`invalid_credentials`, `rate_limited`, `email_not_verified`), **empreinte** SHA-256 de l'email (12 caractères, jamais l'adresse) |
| `signup-refused` | action d'inscription | raison (`refused_public_domain`, `rate_limited`, `already_registered`), empreinte de l'email |
| `forbidden` | `traced()`, sur toute réponse 403 | route (avec `{id}` à la place de l'identifiant), méthode |
| `manager-assigned` | racine de composition | RH, utilisateur, nouveau manager, entreprise |

**6. Des métriques métier, techniques et asynchrones**, avec des attributs à cardinalité bornée : la route devient son modèle (`/api/expense-notes/{id}/decision`), jamais un identifiant.

| Famille | Métriques |
| --- | --- |
| API | `http.route.duration` (latence et taux d'erreur par route, méthode et code), `http.forbidden` |
| Dépendances | `db.client.connections` (pools `app` et `worker` : utilisées, libres, en attente), `storage.operation.duration` (S3, par opération) |
| Métier | `expense.notes.submitted`, `expense.notes.decided` (par décision), `expense.notes.decision_delay` (délai entre soumission et décision), `expense.notes.pending` (notes en attente par ancienneté : < 1 j, 1–3 j, 3–7 j, > 7 j) |
| Comptes | `auth.login.failures` (par raison), `auth.signups` (par issue), `auth.email_verifications`, `users.manager_assignments` |
| Asynchrone | `outbox.pending`, `outbox.oldest_pending_age` (retard de la file), `outbox.dead_letters`, `outbox.messages` et `outbox.message.duration` par type et issue. `ReceiptOcrRequested` donne la durée et les échecs de l'OCR. |

Les jauges de fond (pools, outbox, notes en attente) sont lues avec le rôle `expense_worker`, qui ne lit toujours aucune table métier (ADR 0007). Les notes en attente lui parviennent par une fonction `SECURITY DEFINER` qui ne rend que **4 compteurs agrégés** ; un test vérifie qu'il ne peut toujours pas lire `expense_notes`.

**7. Deux sondes de santé**, documentées dans OpenAPI avant leur implémentation (contrat 2.1.0, MINOR) :
- `GET /api/health/live` répond 200 sans toucher aux dépendances. Un orchestrateur redémarre l'instance si elle échoue.
- `GET /api/health/ready` vérifie Postgres (`SELECT 1` avec le rôle applicatif) et S3 (`HeadBucket`), chacun borné à 2 secondes.
  - Si une dépendance manque, la réponse est **503** en RFC 9457, avec `checks: { postgres, storage }` à `up` ou `down`, sans hôte ni message d'erreur.
  - Le répartiteur cesse alors d'envoyer du trafic sans redémarrer l'instance.
  - Ce n'est pas théorique : la sonde a signalé un bucket absent après un redémarrage de LocalStack.

**8. Tableaux de bord et alertes versionnés, provisionnés au démarrage.**
- `observability/generate.mjs` produit les fichiers dans `observability/grafana/`. On relit et on modifie le PromQL dans ce script, pas dans le JSON Grafana.
- **3 tableaux de bord** :
  - *API* : trafic, 5xx, p95 par route, 4xx, sécurité, pools, S3, logs d'erreur ;
  - *Workflow d'approbation* : soumissions, décisions, délai, notes en souffrance, inscriptions ;
  - *Asynchrone et OCR* : profondeur et retard de la file, lettres mortes, issues par type, durée et échecs de l'OCR, logs du worker.
- **7 alertes** :

| Alerte | Seuil |
| --- | --- |
| Taux de 5xx | > 2 % pendant 5 min |
| Latence p95 | > 1 s pendant 10 min |
| Outbox bloquée | plus vieux message > 5 min |
| Nouvelle lettre morte | au moins 1 de plus en 10 min |
| Pic de 403 | > 20 en 5 min |
| Pic de connexions refusées | > 20 en 5 min |
| Limite de tentatives atteinte | > 5 en 15 min |

  Chaque alerte porte un `runbook` : la requête Loki ou SQL à lancer.
- Vérifié : les 38 requêtes PromQL sont valides, les 7 règles sont saines, et 25 refus 403 déclenchent bien l'alerte « Pic de refus 403 ».

## Alternatives écartées

- **Garder `console` et le JSON fait main.** Il n'y aurait ni masquage, ni niveaux, ni lien vers la trace, et chaque appelant formaterait à sa façon. C'est ce que l'audit reprochait (OPS-02).
- **Prometheus par scraping (`/metrics`) plutôt qu'OTLP.** C'est le standard historique, mais il faut alors trois mécanismes (traces, logs, métriques) au lieu d'un. Un endpoint `/metrics` public serait en plus à protéger. OTLP pousse les trois signaux vers un seul collecteur.
- **Un fournisseur SaaS dès maintenant** (Datadog, Sentry). C'est rapide, mais il faut un compte, une clé et un coût, ce qui couple le code à un vendeur. OpenTelemetry garde ce choix ouvert (*build vs buy*, cours n°2) : on bascule par une variable d'environnement le jour où l'équipe le décide.
- **Une stack éclatée** (un conteneur par composant, comme en production). C'est plus fidèle, mais cela fait 5 services à configurer pour un poste de développement. `otel-lgtm` suffit pour développer et faire une démonstration (KISS) ; en production, on visera un collecteur et des backends gérés.
- **Instrumenter la couche application directement** (`tracer.startActiveSpan` dans chaque cas d'usage). Cela couplerait le cœur à un outil, contre la règle des dépendances de l'ADR 0002. Le décorateur de composition et le port `MessageObserver` donnent le même résultat sans ce couplage.
- **Lire `expense_notes` avec le rôle du worker pour les métriques de fond.** Plus simple, mais le rôle le plus exposé (il lit les jetons de vérification dans l'outbox) aurait alors accès à toutes les notes de toutes les entreprises. La fonction d'agrégat ne lui donne que des compteurs.
- **`X-Request-Id`** en plus de `X-Correlation-Id`. Deux identifiants pour le même usage brouilleraient le contrat. On garde l'existant, et le `trace_id` W3C couvre le reste.

## Conséquences

- **Diagnostic** : on retrouve une requête par son `correlation_id` (renvoyé au client, et présent sur chaque 500). On ouvre sa trace, de la route HTTP jusqu'aux requêtes SQL et au traitement asynchrone.
- **Contrat** : OpenAPI passe en 2.1.0 (MINOR). Deux routes sont ajoutées, et toutes les routes renvoient `X-Correlation-Id`. Aucun comportement existant n'est modifié.
- **Schéma** : la migration `1700000000007_observability.sql` ajoute la colonne `outbox.traceparent` et la fonction `app_pending_notes_by_age`.
- **Tests (27 ajoutés)** :
  - un log d'erreur porte `trace_id`, `span_id` et `correlation_id` ;
  - le masquage des secrets et des emails ;
  - les spans des cas d'usage : attributs, absence de donnée personnelle, erreur métier distinguée d'une panne ;
  - la trace reprise par le worker ;
  - **une décision et sa notification partagent la même trace**, contre le vrai Postgres ;
  - les statistiques d'exploitation et leurs droits ;
  - les jauges de fond ;
  - `ready` répond 503 quand **un vrai client `pg` ne peut pas joindre Postgres**, ou quand S3 ne répond pas à temps.

  En lint, la règle `no-console` empêche le retour d'un `console.*`.
- **Coût** : environ 15 dépendances `@opentelemetry/*` (côté serveur uniquement) et `pino`. Le surcoût par requête (une span par cas d'usage, quelques compteurs) est négligeable devant un aller-retour Postgres.
- **Dettes connues** :
  - les alertes n'ont pas de canal de notification (email, Slack) : elles s'affichent dans Grafana ;
  - aucun échantillonnage n'est configuré (100 % des traces), ce qui convient à ce volume mais sera à revoir en production ;
  - la stack locale n'a pas d'authentification (Grafana anonyme en admin) et ne doit pas être exposée ;
  - `actorRole` n'est pas un attribut de span des cas d'usage. Il est posé sur la span de la requête (`enduser.role`) quand la session est lue.
