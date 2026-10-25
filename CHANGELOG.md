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

### Outillage

- Tests Vitest (`npm test`, `npm run test:unit`, `npm run test:integration`, `make test`) et CI GitHub Actions (lint, typecheck, tests). Voir `docs/adr/0001-strategie-de-tests.md`.
