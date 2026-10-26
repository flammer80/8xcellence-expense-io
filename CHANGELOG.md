# Changelog

Changements de comportement observables de l'application et de son API.
Les identifiants (SEC-xx, ARC-xx…) renvoient à `docs/audit/audit-v2.md`.

## Non publié

### Sécurité — changements volontaires de comportement

Ces comportements étaient eux-mêmes des failles : ils sont corrigés malgré la règle « ne pas casser le comportement observable » (`CLAUDE.md` §9).

- **`GET /api/expense-notes?sort=…`** (SEC-01) : seules les valeurs `<colonne>`, `<colonne> ASC` ou `<colonne> DESC` sont acceptées, avec `created_at`, `expense_date`, `amount` ou `status` (casse indifférente). Toute autre valeur répond **400** `{ "error": "Invalid sort" }` au lieu d'être exécutée en SQL. Sans `sort`, rien ne change.
- **Secret de session** (SEC-02) : `AUTH_SECRET` est lu depuis l'environnement ; l'application **refuse de démarrer** s'il manque, s'il vaut la valeur d'exemple de `.env.example` ou l'ancien secret versionné. L'ancien secret est révoqué : **toutes les sessions ouvertes avant ce changement sont invalidées**, les utilisateurs doivent se reconnecter. `make env` génère un secret aléatoire.
- **`GET /api/manager/expense-notes/{id}/receipt-url`** (SEC-04) : répond **404** si la note n'appartient pas à un subordonné direct du manager connecté (avant : URL du reçu de n'importe quelle note, de n'importe quelle entreprise).
- **`PUT /api/hr/users/{id}/manager`** (SEC-05) : répond **409** `{ "error": "Invalid manager" }` si le manager choisi appartient à une autre entreprise ou si le rattachement créerait un cycle hiérarchique (A → B → A, ou plus long).
- **Erreurs 500** (SEC-07) : le corps devient `{ "error": "Internal Server Error", "correlationId": "<uuid>" }`. Le message, la stack et le SQL ne sont plus renvoyés au client ; ils sont journalisés côté serveur avec le même `correlationId`.

### Workflow d'approbation (étape 3)

Voir `docs/adr/0003-politique-d-approbation.md` et `docs/adr/0004-route-de-decision.md`.

- **Nouveau** : `POST /api/expense-notes/{id}/decision`, avec le corps `{ "decision": "approved" | "rejected", "reason"?: string }`. Ses erreurs suivent la RFC 9457 (`application/problem+json`). Contrat : `docs/api/openapi.yaml`.
- **`GET /api/expense-notes/{id}/receipt-url`** devient la route unique des reçus : elle répond aussi au validateur désigné de la note. Elle répondait 404 à toute personne autre que l'auteur.
- **Notes jusqu'ici bloquées** : la note d'un employé sans manager est tranchée par un RH de l'entreprise, celle d'un RH par un autre RH. `GET /api/hr/expense-notes` liste donc aussi ces notes. Seule exception : la note d'un RH seul dans son entreprise reste en attente.
- **Routes manager** : une note d'une autre entreprise répond 404, même si le rattachement en base est incohérent.
- **Dépréciées, toujours disponibles** : `POST /api/{manager|hr}/expense-notes/{id}/{approve|reject}` et `GET /api/{manager|hr}/expense-notes/{id}/receipt-url`. Elles gardent leurs codes et leur format, et ajoutent les en-têtes `Deprecation: true` et `Link: <…>; rel="successor-version"`.
- **Double décision** : une décision concurrente répond 409, au lieu d'écraser la première.
- **Identifiant invalide** : un id de note qui n'est pas un UUID répond 404 sur les routes de décision et de reçu, au lieu d'une erreur 500.
- **Schéma** : la migration `1700000000002_record-decision.sql` ajoute `decided_by`, `decided_at` et `rejection_reason`. Ces champs ne sont pas encore exposés dans les réponses.

### Schéma, isolation et soumission (étape 4)

Voir `docs/adr/0005-isolation-des-entreprises-en-base.md` et `docs/adr/0006-soumission-atomique.md`.

- **Isolation en base** (SEC-03) : l'application se connecte avec le rôle `expense_app` (`NOSUPERUSER NOBYPASSRLS`). Les policies RLS filtrent les 3 tables par entreprise. Les migrations et le seed utilisent `MIGRATION_DATABASE_URL`. `make env` complète un `.env` existant, et `make dev` crée le rôle (`make ensure-app-role`).
- **`POST /api/expense-notes`** (ARC-06) : aucune note n'est créée si l'envoi du reçu échoue. La réponse 201 porte l'en-tête `Location`. `receiptKey` devient opaque : `receipts/{companyId}/{noteId}.{ext}`, au lieu de `receipts/{n}.{ext}`.
- **Validation** (S9) : répondent maintenant **400** au lieu de 500 ou d'être acceptés :
  - une date qui n'est pas un jour réel (`2026-13-45`, `hier`) ;
  - un reçu dont le contenu ne correspond pas au type annoncé (vérification des premiers octets) ;
  - un montant à plus de deux décimales.
- **`POST /api/expense-notes/{id}/decision`** : un manager qui n'est pas le manager direct reçoit **404** au lieu de 403, car la note lui est cachée. Le 403 reste renvoyé pour sa propre note, ou pour un RH face à la note d'un employé rattaché.
- **Emails** : insensibles à la casse (`citext`) et normalisés en minuscules. On se connecte avec `Alice@Acme.fr` comme avec `alice@acme.fr`, et un doublon qui ne diffère que par la casse est refusé.
- **Inscription** : le compte et l'entreprise sont créés en une transaction (DAT-02). La règle de rattachement par domaine est inchangée.
- **Schéma** : migration `1700000000003_tenant-schema.sql`, qui ajoute :
  - `company_id` sur `expense_notes`, avec une clé étrangère composite vers l'auteur ;
  - `currency` (défaut `EUR`, non exposée) et `updated_at` ;
  - quatre index.

  Elle supprime aussi `receipt_seq`.

### Asynchrone unifié (étape 5)

Voir `docs/adr/0007-asynchrone-unifie.md`. Contrat : `docs/api/openapi.yaml` (v1.3.0).

- **L'employé est prévenu des décisions** : chaque décision (nouvelle route comme anciennes routes approve/reject) produit l'événement `ExpenseNoteDecided`, écrit dans la table `outbox` dans la même transaction que la décision. Le worker en tire une notification, visible sur « Mes notes de frais » et via **`GET /api/notifications`** (nouveau). Une décision refusée (409, 403…) ne publie rien.
- **Nouveau : `POST /api/receipt-suggestions`** répond **202** avec `Location` ; **`GET /api/receipt-suggestions/{id}`** donne l'état (`pending`, `done`, `failed`). L'OCR ne tourne plus dans la requête HTTP. L'écran « Mes notes de frais » utilise ce parcours (polling).
- **`POST /api/expense-notes/receipt-suggestion`** (SEC-08) : déprécié (`Deprecation`, `Link`) mais toujours synchrone et au même format. Un fichier de plus de 5 Mo répond désormais **413** `{ "error": "Fichier trop volumineux" }`. L'OCR réutilise un seul worker Tesseract et traite une image à la fois.
- **Traçabilité** : les routes d'écriture acceptent et renvoient `X-Correlation-Id`. Il est enregistré avec les événements et figure dans les logs JSON du worker ; les erreurs 500 réutilisent le même id.
- **Configuration** : nouvelle variable `WORKER_DATABASE_URL` (rôle Postgres `expense_worker`, ajouté à un `.env` existant par `make env`). `OUTBOX_WORKER=off` désactive le worker sur une instance.
- **Schéma** : la migration `1700000000005_outbox-async.sql` ajoute les tables `outbox`, `notifications` et `receipt_suggestions`, toutes sous RLS, et le rôle `expense_worker`.

### Architecture (sans changement de l'API)

- Noyau hexagonal (`docs/adr/0002-architecture-hexagonale.md`). `GET /api/expense-notes` passe par le cas d'usage `ListMyExpenseNotes`. Les 7 routes qui renvoient des notes partagent un seul mapping. Réponses, codes et tri sont inchangés.
- Configuration S3 unique (`src/infrastructure/s3/s3-config.ts`) : `npm run ensure-bucket` respecte désormais `S3_FORCE_PATH_STYLE`, comme l'application et le seed. Avant ce changement, il forçait le style « chemin ».
- `package.json` déclare `"type": "module"`.

### Outillage

- Garde-fou d'architecture : `npm run lint` échoue si `src/domain/` importe hors du domaine, ou si `src/application/` importe l'infrastructure ou un framework.
- Tests Vitest (`npm test`, `npm run test:unit`, `npm run test:integration`, `make test`) et CI GitHub Actions (lint, typecheck, tests). Voir `docs/adr/0001-strategie-de-tests.md`.

### Contrat et front (étape 6)

Voir `docs/adr/0008-contrat-et-front.md` et `docs/adr/0009-onboarding-et-verification-email.md`. Contrat : `docs/api/openapi.yaml` (**v2.0.0**).

- **Changement cassant (MAJOR)** : `receiptKey` n'est plus renvoyé dans les notes (`GET`/`POST /api/expense-notes`, décision, files de validation, anciennes routes approve/reject). C'était un détail de stockage ; le reçu s'obtient par `GET /api/expense-notes/{id}/receipt-url`.
- **Erreurs RFC 9457** sur `GET`/`POST /api/expense-notes` et `GET /api/expense-notes/{id}/receipt-url` : `Content-Type: application/problem+json`, avec `type`, `title`, `status`, `errors[].pointer`. **Les codes ne changent pas**, et le membre historique `error` est conservé (`Unauthorized`, `Invalid sort`, `Champs invalides`…). Une erreur 500 garde `error` et `correlationId`.
- **Nouveau** : `GET /api/expense-notes/pending` (file de validation de l'utilisateur connecté, avec `authorName`), `GET /api/users` (annuaire, 403 hors RH), `PUT /api/users/{id}/manager` (400 corps invalide, 403 hors RH, 404 cible introuvable, **422** manager invalide ou cycle).
- **Dépréciées, toujours disponibles** (`Deprecation`, `Link`) : `GET /api/manager/expense-notes`, `GET /api/hr/expense-notes`, `GET /api/hr/users`, `PUT /api/hr/users/{id}/manager`. Mêmes codes et même format `{ error }` ; leurs notes portent en plus `authorName`.
- **`PUT /api/hr/users/{id}/manager`** (SEC-10) : un corps absent ou sans `managerId` (chaîne ou `null`) répond **400** `{ "error": "Invalid body" }` au lieu de détacher l'utilisateur. Deux rattachements concurrents qui formeraient un cycle ne passent plus tous les deux.
- **Inscription** (SEC-06, décision R9) :
  - les adresses de messageries grand public (gmail.com, outlook.fr…) sont refusées ;
  - le compte reste **inactif** jusqu'au clic sur le lien de confirmation (24 h), envoyé via l'outbox ; en local, le lien est écrit dans les logs du serveur ;
  - **plus de connexion automatique** après l'inscription ;
  - nouvelle page `/verify-email`.
  Les comptes existants sont réputés vérifiés.
- **Limitation des tentatives** (SEC-11) : 10 connexions par email sur 15 minutes, 5 inscriptions par IP et par heure. Au-delà : « Trop de tentatives ».
- **Écrans** : le manager et le RH voient le nom de l'auteur de chaque note au lieu d'un identifiant tronqué. L'espace RH utilise les nouvelles routes.
- **Configuration** : nouvelle variable facultative `APP_URL` (lien des emails). Paquet renommé `expense-io`.
- **Schéma** : migration `1700000000006_email-verification-rate-limit.sql` (`users.email_verified_at`, tables `email_verifications` et `auth_attempts`, fonctions `app_verify_email` et `app_consume_auth_attempt`).
