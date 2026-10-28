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

Tu peux aussi créer d'autres comptes via `/signup`, avec une adresse
**professionnelle** (gmail.com, outlook.fr… sont refusés) : le premier compte
d'un domaine fonde une nouvelle entreprise et en devient RH ; les suivants la
rejoignent comme employés. Le compte reste inactif jusqu'au clic sur le lien
de confirmation : en local, aucun email n'est envoyé, le lien est écrit dans
les logs du serveur (ligne JSON `"template":"email-verification"`). Les
tentatives sont limitées (10 connexions par email en 15 min, 5 inscriptions
par IP et par heure). Voir `docs/adr/0009-onboarding-et-verification-email.md`.
Le rôle `manager` n'est jamais assignable depuis l'interface — seulement via
le script de seed ou directement en base.

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
`APP_URL` (facultative, `http://localhost:3000` par défaut) sert à construire
les liens envoyés par email.
`OUTBOX_WORKER=off` désactive le worker de l'outbox sur une instance.

## Tests

```bash
make test                 # démarre Postgres si besoin, puis lance tous les tests
npm run test:unit         # domaine, cas d'usage, garde-fou d'architecture (sans base)
npm run test:integration  # route handlers contre la base expense_io_test
npm run test:coverage     # tous les tests + couverture (rapport HTML dans coverage/)
```

Couverture au 2026-10-28 : **95 % des lignes, 92 % des branches**, 100 % des
lignes du domaine. Des seuils par couche (`vitest.config.ts`) font échouer la
CI si l'une d'elles régresse (`docs/adr/0010-couverture-de-tests.md`).

Les tests d'intégration recréent la base `expense_io_test` (jamais la base de
dev) sur le Postgres du `docker-compose` ; ils nécessitent donc Docker. Une
autre base peut être visée avec `TEST_DATABASE_URL` (son nom doit finir par
`_test`). L'application y est exercée avec le rôle applicatif `expense_app`,
comme en production ; seules les fixtures passent par le rôle propriétaire. La CI GitHub Actions lance lint, typecheck et tests avec couverture à chaque push ; le rapport HTML est publié en artefact.

- `tests/integration/` fige le comportement actuel des routes (contrat à préserver) ;
- `tests/security/` contient un test par faille de l'audit (`docs/audit/audit-v2.md`) ;
- `tests/unit/frontContract.test.ts` et `tests/unit/openapi.test.ts` sont des garde-fous :
  aucun `eslint-disable`, aucun type d'API redéclaré dans le front, et une spec OpenAPI
  qui documente exactement les routes implémentées.

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
| `src/interface/http/` | Types DTO partagés avec le front (`dto.ts`), mappers, schémas zod, erreurs RFC 9457 |
| `src/components/api/` | Client d'API du front (seul endroit qui appelle `fetch`) et hook de chargement |
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
Le contrat d'API est `docs/api/openapi.yaml` (v2.0.0) : il est mis à jour
avant chaque changement de route. Les formes JSON qu'il décrit sont déclarées
une seule fois, dans `src/interface/http/dto.ts`, et importées en `import type`
par le front : un champ renommé côté serveur casse le typecheck de l'écran
concerné (`docs/adr/0008-contrat-et-front.md`). Les anciennes routes restent
disponibles, dépréciées (`Deprecation`, `Link`), comme adaptateurs fins.

`npm run lint` fait respecter ces frontières. Plus aucune route ne contient
de SQL : il ne vit que dans `src/infrastructure/postgres/`.

## Autres commandes

```bash
make build   # build de production
make start   # build puis démarre en production
make lint
make typecheck
make down    # arrête Postgres/LocalStack
make clean   # arrête et supprime les données locales
```
