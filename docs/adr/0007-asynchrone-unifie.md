# ADR 0007 — Asynchrone unifié : l'outbox comme file unique

- **Statut :** accepté
- **Date :** 2026-10-26
- **Contexte de l'audit :** ARC-07 (aucun échange asynchrone), SEC-08 (OCR sans garde-fou), OPS-02 (logs sans corrélation), recommandation R7 — `docs/audit/audit-v2.md`

## Contexte

Avant cette étape, Expense.io n'avait **aucun** échange asynchrone, alors que deux besoins réels l'exigeaient.

- **La notification manquait.** `NotificationPort` existait mais n'était jamais appelé. Un employé ne savait pas que sa note avait été tranchée, sauf à recharger sa liste.
- **L'OCR bloquait la requête HTTP** (`lib/ocr.ts`) :
  - chaque appel créait un worker Tesseract et rechargeait le modèle de 707 Ko (`cacheMethod: 'none'`) ;
  - aucune taille de fichier n'était limitée ;
  - rien ne bornait le nombre d'analyses simultanées.

  Quelques uploads lourds suffisaient à saturer le CPU. C'est l'épisode (3) du cours n°2 : « la résilience du système est celle de son maillon le plus lent ».

Les évolutions annoncées vont toutes dans le même sens : catégorisation par IA, rôle finance, email, comptabilité. Elles réagiront à des faits métier (« une note a été soumise », « une note a été tranchée ») sans devoir ralentir la requête qui les produit.

Le cours rappelle aussi que l'asynchrone est par nature plus complexe et que son utilité doit être questionnée. On ne l'introduit donc que pour ces deux besoins, et on n'en garde **qu'un seul protocole**.

## Décision

**1. Deux événements de domaine versionnés**, dans `src/domain/events.ts` : `ExpenseNoteSubmitted` et `ExpenseNoteDecided`.
- Leur enveloppe contient `id`, `type`, `version`, `companyId`, `occurredAt` et `payload`.
- `type` + `version` forment le **contrat** du message : changer un payload, c'est publier une version 2, jamais modifier la version 1 en place.
- Le payload porte ce qu'il faut pour réagir sans relire la note (*event-carried state transfer*).

**2. Pattern outbox : l'événement est écrit dans la même transaction que la note.**
- `ExpenseNoteRepository.add` et `saveDecision` reçoivent les événements, et l'adaptateur Postgres les insère dans `outbox` **dans le même `withUserScope`**, donc la même transaction.
- Une transaction annulée ne laisse aucun événement. C'est le cas quand l'insertion échoue, quand une décision est refusée (409), ou quand la RLS refuse l'écriture.
- À l'inverse, une décision enregistrée a toujours son événement : il n'y a pas de « double écriture » base + broker qui pourrait diverger.

**3. L'outbox *est* la file : un worker maison plutôt que pg-boss.** La table `outbox` porte aussi l'état de livraison :

| Colonne | Rôle |
| --- | --- |
| `attempts` | nombre de tentatives |
| `available_at` | date de la prochaine tentative (backoff exponentiel : 2 s, 4 s, 8 s…) |
| `locked_until` | **bail** : un message réclamé mais jamais acquitté (worker planté) est redistribué à son expiration |
| `processed_at` | **ack** |
| `dead_at` | **lettre morte (DLQ)** après 5 échecs, avec `last_error`, pour traitement manuel |

Le worker (`src/application/OutboxWorker.ts`) réclame les messages par lot avec `FOR UPDATE SKIP LOCKED`. Plusieurs instances peuvent donc tourner sans jamais traiter deux fois le même message en même temps.

**4. Les jobs passent par la même file.** L'analyse OCR d'un reçu (`ReceiptOcrRequested`) n'est pas un fait métier, mais une commande technique. Elle partage pourtant l'enveloppe, la table et le worker : il n'y a **qu'un seul protocole asynchrone** à connaître, superviser et documenter.

**5. Chorégraphie, pas orchestration.** Chaque type de message a au plus un consommateur, déclaré dans `src/composition.ts` :

| Message | Consommateur | Effet |
| --- | --- | --- |
| `ExpenseNoteDecided` v1 | `NotifyAuthorOfDecision` | notification de l'auteur |
| `ReceiptOcrRequested` v1 | `ProcessReceiptOcr` | analyse, résultat, suppression du fichier temporaire ; `failed` en DLQ |
| `ExpenseNoteSubmitted` v1 | aucun pour l'instant | acquitté ; point d'extension (catégorisation IA, notification du validateur) |

Ajouter un consommateur ne touche ni le cas d'usage, ni la route.

**6. Les consommateurs sont idempotents.** Un message peut être livré deux fois : le worker peut planter entre le traitement et l'ack.
- **Notification** : `notifications.event_id` est `UNIQUE`, et l'insertion se fait en `ON CONFLICT DO NOTHING`.
- **OCR** : une demande déjà traitée est ignorée, et le résultat n'est écrit que `WHERE status = 'pending'`.

**7. Moindre privilège : un troisième rôle Postgres, `expense_worker`.**
- Il lit l'outbox de toutes les entreprises et ne peut modifier que les colonnes de livraison, jamais le payload.
- Il ne lit **aucune** table métier.
- Pour traiter un message, le worker agit **au nom du destinataire**, avec le rôle applicatif (`withUserScope`) : la RLS s'applique encore. On ne peut notifier quelqu'un que dans sa propre entreprise.
- Côté application, `expense_app` peut *insérer* dans l'outbox, pour sa seule entreprise (policy), mais ne peut pas la *relire*.

**8. OCR asynchrone : 202 + polling.** `POST /api/receipt-suggestions` :
- vérifie le fichier (5 Mo au plus, type contrôlé sur son contenu) ;
- le dépose dans le stockage objet sous `ocr/{companyId}/{id}` ;
- enregistre la demande et son job dans la même transaction ;
- répond **202** avec `Location` et `Retry-After`.

Le client interroge `GET /api/receipt-suggestions/{id}` jusqu'à `done` ou `failed`. On distingue ainsi l'**erreur d'acceptation** (400, 401, 422 sur le POST) de l'**erreur de traitement** (statut `failed` après la lettre morte), comme le recommande le cours n°3. Le polling est préféré au webhook, réservé aux intégrations tierces : le seul client est notre front.

**9. Tesseract borné.** `lib/ocr.ts` garde **un seul worker Tesseract** pour tout le process. Il est créé à la première analyse, réutilisé ensuite, et recréé s'il plante. Les analyses passent **une à la fois** : l'OCR occupe au plus un cœur, quel que soit le nombre de demandes.

**10. Traçabilité.**
- Les routes d'écriture reprennent `X-Correlation-Id` ou en génèrent un, et le renvoient.
- L'id suit la requête grâce à `AsyncLocalStorage` (`src/lib/correlation.ts`). Il est enregistré avec chaque message de l'outbox et figure dans chaque log JSON du worker (`processed`, `retry-scheduled`, `dead-letter`…).
- Une erreur 500 réutilise le même id. En asynchrone, où l'on ne sait pas quel worker a traité quoi, c'est ce qui permet de remonter d'un incident à la requête d'origine.

**11. Le worker démarre avec le serveur.** `src/instrumentation.ts` est le hook de démarrage de Next.js. `make dev` suffit donc, sans process supplémentaire à lancer, à superviser ni à oublier. `OUTBOX_WORKER=off` le désactive sur une instance.

## Alternatives écartées

- **pg-boss**, proposé par l'audit (R7). C'est une très bonne file sur Postgres, mais elle aurait ajouté une **seconde** file derrière l'outbox : il aurait fallu un relais outbox → pg-boss, puis pg-boss → consommateurs, avec son propre schéma (une dizaine de tables et fonctions) et son propre rôle à privilégier. L'outbox seule fournit déjà ce que le ticket demande : ack, retry, DLQ, concurrence. Elle le fait en environ 260 lignes testées (worker + adaptateur Postgres), lisibles par un humain comme par un LLM (KISS). Si un jour on a besoin de planification (cron), de priorités ou de débit élevé, pg-boss pourra devenir l'adaptateur de `OutboxStore` sans toucher au domaine ni aux cas d'usage.
- **Kafka, RabbitMQ, SQS.** Ils ajoutent un composant à déployer, superviser et sécuriser, et une transaction distribuée base + broker, c'est-à-dire précisément le problème que l'outbox évite. C'est disproportionné pour un monolithe et un seul client (cours n°2, KISS).
- **Publier l'événement après le `COMMIT`**, en mémoire ou par un appel direct. Un crash entre les deux perd l'événement, et l'employé n'est jamais prévenu.
- **Garder l'OCR synchrone avec un simple sémaphore.** Le CPU serait protégé, mais la requête HTTP resterait suspendue pendant l'analyse : timeouts, retries côté client, ambiguïté sur ce qui a été traité. C'est l'épisode (3) du cours.
- **Webhook pour l'OCR.** Notre seul client est un navigateur, qui ne peut pas recevoir d'appel entrant. Le polling suffit.
- **Notifications par email dès maintenant.** Il faudrait un serveur SMTP et des secrets, sans moyen de le démontrer en local. La notification dans l'application est le premier adaptateur du `NotificationPort` ; l'email s'ajoutera comme second adaptateur ou second consommateur.
- **Worker dans un process séparé** (`npm run worker`). C'est plus proche d'une production à grande échelle, mais c'est un process de plus à lancer en local et dans les E2E. On le fera quand la charge le justifiera ; le code est déjà prêt, puisque `SKIP LOCKED` gère plusieurs instances.

## Conséquences

- **Ticket rempli :**
  - l'employé est notifié ;
  - l'OCR ne bloque plus la requête : sur le serveur de dev, le POST répond 202 en ~200 ms, et le résultat arrive ~1 s plus tard avec le vrai Tesseract ;
  - aucun événement n'est publié pour une transaction annulée.
- **Tests :**
  - `tests/integration/outbox.test.ts` : événement écrit avec la note, rien sur rollback ni sur 409, notification unique malgré un rejeu, RLS des deux rôles ;
  - `tests/integration/receipt-suggestions.test.ts` : 202, polling, `done`, `failed` en DLQ, 404 pour un autre utilisateur ;
  - `tests/unit/application/OutboxWorker.test.ts` : ack, retry, DLQ, version inconnue, bail expiré ;
  - `tests/unit/infrastructure/ocr.test.ts` : un worker Tesseract, une analyse à la fois.
- **Ancienne route conservée.** `POST /api/expense-notes/receipt-suggestion` reste synchrone et au même format (question ouverte n°5 de l'audit), mais elle est bornée (5 Mo, sinon 413 ; worker partagé ; une analyse à la fois) et dépréciée (`Deprecation`, `Link`). Le front utilise désormais le nouveau parcours.
- **Configuration.** Une variable de plus, `WORKER_DATABASE_URL`. `make env` complète un `.env` existant, et `make ensure-app-role` ouvre la connexion des deux rôles.
- **Cohérence à terme.** La notification arrive environ une seconde après la décision, pas dans la même requête. C'est le prix, assumé, du découplage.
- **Exploitation.** Les messages en lettre morte se lisent avec `SELECT * FROM outbox WHERE dead_at IS NOT NULL`. On les rejoue en remettant `dead_at = NULL, attempts = 0`. La purge des messages acquittés n'est pas encore automatisée : c'est une dette mineure, à traiter avec la MCO (cours n°5).
- **Limite connue.** L'ordre n'est garanti que par `occurred_at`, entre messages disponibles. Deux messages d'une même note peuvent être traités dans le désordre après un retry. Aucun consommateur actuel n'en dépend ; un consommateur qui en dépendrait devra le vérifier lui-même (par exemple avec la version de la note).
