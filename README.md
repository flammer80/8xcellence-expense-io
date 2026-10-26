# Expense.io

Application de gestion de notes de frais.

## Prérequis

- Node.js 24+
- Docker (Postgres + LocalStack en local)

## Démarrage

```bash
make dev
```

Ceci installe les dépendances, démarre Postgres et LocalStack, applique les
migrations, ouvre la connexion du rôle applicatif, crée le bucket de stockage, peuple des comptes de démonstration
(voir "Comptes" plus bas), puis lance le serveur de développement sur
http://localhost:3000.

Sans `make`, l'équivalent manuel :

```bash
npm install
cp .env.example .env
docker compose up -d
npm run migrate:up
npm run ensure-app-role
npm run ensure-bucket
npm run seed
npm run dev
```

## Comptes

`make dev` (ou `npm run seed`) crée trois comptes de la même entreprise,
avec chacun une note de frais en attente pour les deux derniers —
relançable sans dupliquer quoi que ce soit :

| Rôle | Email | Mot de passe |
|---|---|---|
| RH | `hr@expense.io` | `hr1234` |
| Manager (racine, sans manager assigné) | `manager@expense.io` | `manager1234` |
| Employé (rattaché au manager ci-dessus) | `demo@expense.io` | `demo1234` |

Tu peux aussi créer d'autres comptes via `/signup` : le premier compte créé
sur un domaine email donné fonde une nouvelle entreprise et en devient RH ;
les comptes suivants sur le même domaine la rejoignent comme employés. Le
rôle `manager` n'est en revanche jamais assignable depuis l'interface —
seulement via le script de seed ou directement en base.

## Variables d'environnement

Voir `.env.example`. `AUTH_SECRET` est obligatoire : l'application refuse de
démarrer sans lui, ou avec la valeur d'exemple. `make env` (appelé par
`make dev`) en génère un.

Postgres est utilisé avec trois rôles (`docs/adr/0005-isolation-des-entreprises-en-base.md`,
`docs/adr/0007-asynchrone-unifie.md`) :

| Variable | Rôle | Utilisée par |
|---|---|---|
| `DATABASE_URL` | `expense_app`, soumis à la RLS | l'application |
| `WORKER_DATABASE_URL` | `expense_worker`, ne lit que la table `outbox` | le worker de l'outbox |
| `MIGRATION_DATABASE_URL` | `expense`, propriétaire du schéma | migrations, seed, `make ensure-app-role` |

`make env` ajoute ces variables à un `.env` créé avant leur introduction.
`OUTBOX_WORKER=off` désactive le worker de l'outbox sur une instance.

## Tests

```bash
make test                 # démarre Postgres si besoin, puis lance tous les tests
npm run test:unit         # domaine, cas d'usage, garde-fou d'architecture (sans base)
npm run test:integration  # route handlers contre la base expense_io_test
```

Les tests d'intégration recréent la base `expense_io_test` (jamais la base de
dev) sur le Postgres du `docker-compose` ; ils nécessitent donc Docker. Une
autre base peut être visée avec `TEST_DATABASE_URL` (son nom doit finir par
`_test`). L'application y est exercée avec le rôle applicatif `expense_app`,
comme en production ; seules les fixtures passent par le rôle propriétaire. La CI GitHub Actions lance lint, typecheck et tests à chaque push.

- `tests/integration/` fige le comportement actuel des routes (contrat à préserver) ;
- `tests/security/` contient un test par faille de l'audit (`docs/audit/audit-v2.md`).

Stratégie et choix : `docs/adr/0001-strategie-de-tests.md`. Changements de
comportement : `CHANGELOG.md`.

## Architecture

Monolithe Next.js en architecture hexagonale ; les dépendances pointent vers
le domaine (`docs/adr/0002-architecture-hexagonale.md`) :

| Dossier | Rôle |
|---|---|
| `src/domain/` | Entités, value objects (`Money`, `ExpenseDate`, `ReceiptFile`), erreurs ; aucun import externe |
| `src/application/` | Cas d'usage (`SubmitExpenseNote`, `DecideExpenseNote`…) et leurs ports (`application/ports/`) |
| `src/infrastructure/` | Adaptateurs : Postgres (seul endroit du SQL migré), S3, notifications, en mémoire pour les tests |
| `src/interface/http/` | DTO et lecture des paramètres HTTP |
| `src/app/` | Pages et routes Next.js ; une route migrée = session → cas d'usage → réponse |
| `src/composition.ts` | Racine de composition : relie chaque port à son adaptateur |

Les règles « qui tranche quelle note » vivent dans un seul fichier,
`src/domain/ApprovalPolicy.ts` (`docs/adr/0003-politique-d-approbation.md`).
L'isolation entre entreprises est garantie en plus par PostgreSQL : rôle
applicatif sans privilège et policies RLS filtrées par entreprise
(`docs/adr/0005-isolation-des-entreprises-en-base.md`). Une note ne peut pas
exister sans reçu (`docs/adr/0006-soumission-atomique.md`).
Tout l'asynchrone passe par une seule file, la table `outbox` : les
événements (`ExpenseNoteSubmitted`, `ExpenseNoteDecided`) y sont écrits dans
la même transaction que la note, et les jobs (analyse OCR d'un reçu) y sont
déposés de la même façon. Un worker unique, lancé avec le serveur
(`src/instrumentation.ts`), les distribue aux consommateurs, avec retries,
lettre morte et logs JSON portant l'id de corrélation de la requête
(`docs/adr/0007-asynchrone-unifie.md`).
Le contrat d'API est `docs/api/openapi.yaml` : il est mis à jour avant chaque
changement de route.

`npm run lint` fait respecter ces frontières. Les routes pas encore migrées
gardent leur SQL ; elles le perdront aux étapes suivantes du plan
(`docs/audit/audit-v2.md`).

## Autres commandes

```bash
make build   # build de production
make start   # build puis démarre en production
make lint
make typecheck
make down    # arrête Postgres/LocalStack
make clean   # arrête et supprime les données locales
```
